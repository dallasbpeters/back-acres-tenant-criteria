import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { noticeVersions } from "../../lib/db/schema";
loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  ids: string[] = [];
test.afterAll(async () => {
  const d = drizzle(process.env.DATABASE_URL!);
  for (const id of ids)
    await d.delete(noticeVersions).where(eq(noticeVersions.id, id));
});
test("notice templates preserve recipient details and save their source revision; desktop and mobile controls have room", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      sub: "notice-template-test",
      googleVerified: true,
    },
    maxAge: 3600,
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/admin/adverse-actions/new");
  const name = `NOTICE LAYOUT TEST ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Applicant full name", { exact: true }).fill(name);
  await page
    .getByLabel("Applicant email", { exact: true })
    .fill("notice-test@example.invalid");
  await page
    .getByLabel("Sender contact information")
    .fill("owner@example.invalid");
  const picker = page.locator(".notice-template-panel");
  await expect(picker).toHaveAttribute("open", "");
  await picker.getByRole("button", { name: /Notice template/ }).click();
  await page
    .getByRole("option", {
      name: "Conditional approval · higher deposit",
      exact: true,
    })
    .click();
  await expect(
    picker.getByRole("button", { name: "Use template", exact: true }),
  ).toBeDisabled();
  await picker
    .getByLabel("Required total deposit and payment terms")
    .fill("Total security deposit: $3,000, due before move-in.");
  await picker
    .getByLabel("Specific verified reason (optional)")
    .fill(
      "The verified report information does not meet the disclosed deposit criteria.",
    );
  await picker
    .locator("summary")
    .filter({ hasText: "Sources and review status" })
    .click();
  await expect(picker).toContainText(
    "has not been reviewed or approved by an attorney for Back Acres",
  );
  await expect(picker.getByRole("link", { name: /FTC:/ })).toHaveAttribute(
    "href",
    /ftc.gov/,
  );
  await picker
    .getByRole("button", { name: "Use template", exact: true })
    .click();
  await expect(picker).not.toHaveAttribute("open", "");
  await expect(
    page.getByLabel("Applicant full name", { exact: true }),
  ).toHaveValue(name);
  await expect(
    page.getByRole("textbox", {
      name: "Reasons for the decision",
      exact: true,
    }),
  ).toContainText("higher security deposit");
  await expect(
    page.getByLabel("Decision details or required terms"),
  ).toHaveValue("Total security deposit: $3,000, due before move-in.");
  await page.getByRole("button", { name: /Choose reporting agency 1/ }).click();
  await page.getByRole("option", { name: "Experian", exact: true }).click();
  const save = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/notices") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  const version = (await (await save).json()).version;
  ids.push(version.id);
  expect(version.notice.template).toEqual({
    id: "report-deposit",
    revision: "2026-10-17.1",
  });
  await page.reload();
  await expect(
    page.getByLabel("Applicant full name", { exact: true }),
  ).toHaveValue(name);
  const back = await page
    .getByRole("link", { name: "← All adverse-action notices", exact: true })
    .boundingBox();
  const remove = await page
    .getByRole("button", {
      name: `Remove adverse-action notice: ${name}`,
      exact: true,
    })
    .boundingBox();
  expect(remove!.x - (back!.x + back!.width)).toBeGreaterThanOrEqual(16);
  const saveRect = await page
    .getByRole("button", { name: "Save new version", exact: true })
    .boundingBox();
  const previewRect = await page
    .getByRole("button", { name: "Preview notice", exact: true })
    .boundingBox();
  expect(
    previewRect!.x - (saveRect!.x + saveRect!.width),
  ).toBeGreaterThanOrEqual(8);
  await expect(page.locator(".notice-history .version-item")).toContainText(
    "Version 1",
  );
  await page.screenshot({
    path: "test-results/notice-layout-dark.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({
    path: "test-results/notice-layout-light.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByLabel("Applicant full name", { exact: true }),
  ).toHaveValue(name);
  await expect(page.locator(".owner-navbar")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Preview notice", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/notice-layout-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
