import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { noticeVersions, noticeDeliveries } from "../../lib/db/schema";
loadEnvConfig(process.cwd());
const origin = "http://localhost:3191";
const ids: string[] = [];
test.afterAll(async () => {
  const db = drizzle(process.env.DATABASE_URL!);
  for (const id of ids) {
    await db.delete(noticeDeliveries).where(eq(noticeDeliveries.versionId, id));
    await db.delete(noticeVersions).where(eq(noticeVersions.id, id));
  }
});
test("private access, rich editing, durable versions, conflicts, mobile and duplicate protection", async ({
  page,
  request,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  expect((await request.get("/api/admin/notices")).status()).toBe(401);
  expect(
    (await request.post("/api/admin/notices/send", { data: {} })).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/admin/session", {
        headers: { origin: "https://example.com" },
        data: { password: "retired-password" },
      })
    ).status(),
  ).toBe(410);
  await page.goto("/admin/adverse-actions");
  await expect(
    page.getByRole("heading", { name: "Adverse action notices" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  // Locally signed fixture exercises session enforcement, not Google's consent UI.
  const email = process.env.ADMIN_EMAILS?.split(",")[0];
  if (!email || !process.env.NEXTAUTH_SECRET)
    throw new Error("Set a local test ADMIN_EMAILS and NEXTAUTH_SECRET.");
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET,
    token: { email, sub: "test-only", googleVerified: true },
    maxAge: 3600,
  });
  await page
    .context()
    .addCookies([
      {
        name: "next-auth.session-token",
        value: token,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "New notice", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Applicant full name").fill("E2E Test Applicant");
  await page
    .getByLabel("Applicant email", { exact: true })
    .fill("delivered@resend.dev");
  await page.getByLabel("Sender contact information").fill("Test contact");
  await page
    .getByRole("textbox", { name: "Reasons for the decision" })
    .fill("Verified reason for testing.");
  await page.getByLabel("Choose reporting agency 1", { exact: true }).selectOption("experian");
  await expect(page.getByLabel("Agency name", { exact: true })).toHaveValue("Experian Information Solutions, Inc.");
  await expect(page.getByLabel("Mailing address", { exact: true })).toHaveValue("P.O. Box 2002, Allen, TX 75013");
  await expect(page.getByLabel("Phone / toll-free number")).toHaveValue("1-888-397-3742");
  await page.getByLabel("Agency name", { exact: true }).fill("Test agency");
  await page.getByLabel("Mailing address", { exact: true }).fill("123 Test St");
  await page.getByLabel("Phone / toll-free number").fill("800-555-0100");
  const save = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/notices") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save new version" }).click();
  const first = (await (await save).json()).version;
  ids.push(first.id);
  await expect(
    page.getByText("Version 1 saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /E2E Test Applicant/ })
    .first()
    .click();
  await expect(page.getByLabel("Applicant full name")).toHaveValue(
    "E2E Test Applicant",
  );
  await expect(
    page.getByRole("textbox", { name: "Reasons for the decision" }),
  ).toContainText("Verified reason");
  await page
    .getByRole("textbox", { name: "Reasons for the decision" })
    .fill("Second saved reason.");
  const secondSave = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/notices") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save new version" }).click();
  const second = (await (await secondSave).json()).version;
  ids.push(second.id);
  expect(second.version).toBe(2);
  expect(second.documentId).toBe(first.documentId);
  const stale = await page.request.post("/api/admin/notices", {
    headers: { origin },
    data: {
      parentId: first.id,
      requestId: crypto.randomUUID(),
      notice: first.notice,
    },
  });
  expect(stale.status()).toBe(409);
  const csrf = await page.request.post("/api/admin/notices", {
    headers: { origin: "https://example.com" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  await page.screenshot({
    path: "test-results/adverse-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preview notice" }).click();
  await expect(
    page.getByRole("article", { name: "Notice preview" }),
  ).toContainText("Second saved reason.");
  await expect(
    page.getByRole("button", { name: "Send notice", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I reviewed this saved version/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Send notice", exact: true }),
  ).toBeEnabled();
  // A durable existing claim blocks all further attempts without calling Resend.
  await drizzle(process.env.DATABASE_URL!).insert(noticeDeliveries).values({
    versionId: second.id,
    status: "accepted",
    resendId: "test-only-no-email-sent",
  });
  const duplicate = await page.request.post("/api/admin/notices/send", {
    headers: { origin },
    data: { versionId: second.id, confirmed: true },
  });
  expect(duplicate.status()).toBe(409);
  await page.screenshot({
    path: "test-results/adverse-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/adverse-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/notices")).status()).toBe(401);
  expect(browserErrors).toEqual([]);
});

test("Google authorization uses PKCE/state and denied sessions cannot read notices", async ({
  request,
  browser,
}) => {
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const response = await request.post("/api/auth/signin/google", {
    form: {
      csrfToken: csrf.csrfToken,
      callbackUrl: `${origin}/admin/adverse-actions`,
      json: "true",
    },
  });
  const data = await response.json();
  const url = new URL(data.url);
  expect(url.hostname).toBe("accounts.google.com");
  expect(url.searchParams.get("redirect_uri")).toBe(
    `${origin}/api/auth/callback/google`,
  );
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
    "email",
    "openid",
    "profile",
  ]);
  for (const token of [
    { email: "outsider@example.invalid", googleVerified: true },
    { email: process.env.ADMIN_EMAILS, googleVerified: false },
  ]) {
    const context = await browser.newContext();
    const encoded = await encode({
      secret: process.env.NEXTAUTH_SECRET!,
      token,
      maxAge: 3600,
    });
    await context.addCookies([
      { name: "next-auth.session-token", value: encoded, url: origin },
    ]);
    expect(
      (await context.request.get(`${origin}/api/admin/notices`)).status(),
    ).toBe(401);
    await context.close();
  }
});
