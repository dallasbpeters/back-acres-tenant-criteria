// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
import { requireValue } from "@/lib/required";

const pattern1 = /Notice template/;
const pattern2 = /FTC:/;
const pattern3 = /ftc.gov/;
const pattern4 = /Choose reporting agency 1/;

import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { encode } from "next-auth/jwt";
import { noticeVersions } from "../../lib/db/schema";

loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  ids: string[] = [];
test.afterAll(async () => {
  const d = drizzle(
    requireValue(process.env.DATABASE_URL, "Expected process.env.DATABASE_URL")
  );
  for (const id of ids) {
    await d.delete(noticeVersions).where(eq(noticeVersions.id, id));
  }
});
test("notice templates preserve recipient details and save their source revision; desktop and mobile controls have room", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const token = await encode({
    maxAge: 3600,
    secret: requireValue(
      process.env.NEXTAUTH_SECRET,
      "Expected process.env.NEXTAUTH_SECRET"
    ),
    token: {
      email: requireValue(
        process.env.ADMIN_EMAILS,
        "Expected process.env.ADMIN_EMAILS"
      ).split(",")[0],
      googleVerified: true,
      sub: "notice-template-test",
    },
  });
  await page.context().addCookies([
    {
      httpOnly: true,
      name: "next-auth.session-token",
      sameSite: "Lax",
      url: origin,
      value: token,
    },
  ]);
  await page.setViewportSize({ height: 1000, width: 1440 });
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
  await picker.getByRole("button", { name: pattern1 }).click();
  await page
    .getByRole("option", {
      exact: true,
      name: "Conditional approval · higher deposit",
    })
    .click();
  await expect(
    picker.getByRole("button", { exact: true, name: "Use template" })
  ).toBeDisabled();
  await picker
    .getByLabel("Required total deposit and payment terms")
    .fill("Total security deposit: $3,000, due before move-in.");
  await picker
    .getByLabel("Specific verified reason (optional)")
    .fill(
      "The verified report information does not meet the disclosed deposit criteria."
    );
  await picker
    .locator("summary")
    .filter({ hasText: "Sources and review status" })
    .click();
  await expect(picker).toContainText(
    "has not been reviewed or approved by an attorney for Back Acres"
  );
  await expect(picker.getByRole("link", { name: pattern2 })).toHaveAttribute(
    "href",
    pattern3
  );
  await picker
    .getByRole("button", { exact: true, name: "Use template" })
    .click();
  await expect(picker).not.toHaveAttribute("open", "");
  await expect(
    page.getByLabel("Applicant full name", { exact: true })
  ).toHaveValue(name);
  await expect(
    page.getByRole("textbox", {
      exact: true,
      name: "Reasons for the decision",
    })
  ).toContainText("higher security deposit");
  await expect(
    page.getByLabel("Decision details or required terms")
  ).toHaveValue("Total security deposit: $3,000, due before move-in.");
  await page.getByRole("button", { name: pattern4 }).click();
  await page.getByRole("option", { exact: true, name: "Experian" }).click();
  const save = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/notices") && r.request().method() === "POST"
  );
  await page
    .getByRole("button", { exact: true, name: "Save new version" })
    .click();
  const { version } = await (await save).json();
  ids.push(version.id);
  expect(version.notice.template).toEqual({
    id: "report-deposit",
    revision: "2026-10-17.1",
  });
  await page.reload();
  await expect(
    page.getByLabel("Applicant full name", { exact: true })
  ).toHaveValue(name);
  const back = await page
    .getByRole("link", { exact: true, name: "← All adverse-action notices" })
    .boundingBox();
  const remove = await page
    .getByRole("button", {
      exact: true,
      name: `Remove adverse-action notice: ${name}`,
    })
    .boundingBox();
  expect(
    requireValue(remove, "Expected remove").x -
      (requireValue(back, "Expected back").x +
        requireValue(back, "Expected back").width)
  ).toBeGreaterThanOrEqual(16);
  const saveRect = await page
    .getByRole("button", { exact: true, name: "Save new version" })
    .boundingBox();
  const previewRect = await page
    .getByRole("button", { exact: true, name: "Preview notice" })
    .boundingBox();
  expect(
    requireValue(previewRect, "Expected previewRect").x -
      (requireValue(saveRect, "Expected saveRect").x +
        requireValue(saveRect, "Expected saveRect").width)
  ).toBeGreaterThanOrEqual(8);
  await expect(page.locator(".notice-history .version-item")).toContainText(
    "Version 1"
  );
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: "test-results/notice-layout-dark.png",
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: "test-results/notice-layout-light.png",
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.reload();
  await expect(
    page.getByLabel("Applicant full name", { exact: true })
  ).toHaveValue(name);
  await expect(page.locator(".owner-navbar")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await expect(
    page.getByRole("button", { exact: true, name: "Preview notice" })
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: "test-results/notice-layout-mobile.png",
  });
  expect(errors).toEqual([]);
});
