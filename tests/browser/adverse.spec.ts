import { test, expect } from "@playwright/test";
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
        data: { password: process.env.ADMIN_PASSWORD },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin/adverse-actions");
  await expect(
    page.getByRole("heading", { name: "Adverse action notices" }),
  ).toBeVisible();
  await page.getByLabel("Access password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
  await drizzle(process.env.DATABASE_URL!)
    .insert(noticeDeliveries)
    .values({
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
  await expect(page.getByLabel("Access password")).toBeVisible();
  expect((await page.request.get("/api/admin/notices")).status()).toBe(401);
  expect(browserErrors).toEqual([]);
});
