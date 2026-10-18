import { requireValue } from "@/lib/required";

const pattern1 = /Payment collection/;
const pattern2 = /property/i;

import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

loadEnvConfig(process.cwd());
const origin = "http://localhost:3191";
const sql = neon(
  requireValue(process.env.DATABASE_URL, "Expected process.env.DATABASE_URL")
);
const propertyId = crypto.randomUUID(),
  scheduleId = crypto.randomUUID();
test.afterAll(async () => {
  await sql`DELETE FROM rent_schedules WHERE property_id=${propertyId}`;
  await sql`DELETE FROM properties WHERE id=${propertyId}`;
});
test("full-width owner sidebar and tenant-authorized ACH enrollment with revocation", async ({
  page,
  request,
}) => {
  expect(
    (await request.post("/api/admin/billing", { data: {} })).status()
  ).toBe(401);
  expect(
    (
      await request.post("/api/payments/autopay", {
        data: {},
        headers: { origin: "https://evil.example" },
      })
    ).status()
  ).toBe(403);
  await sql`INSERT INTO properties(id,slug,data) VALUES (${propertyId},${`ach-test-${propertyId}`},${JSON.stringify({ address: "1 Test Lane", contact: "owner@example.invalid", name: "ACH TEST property" })}::jsonb)`;
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
      sub: "test-owner",
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
  const firstDate = new Date();
  firstDate.setUTCMonth(firstDate.getUTCMonth() + 1, 10);
  const data = {
    authorized: true,
    collection: "ach",
    firstDate: firstDate.toISOString().slice(0, 10),
    installments: 2,
    monthlyCents: 100,
    payerEmail: "ach-test@example.invalid",
    payerName: "ACH TEST payer",
    propertyId,
  };
  const result = await page.request.post("/api/admin/billing", {
    data: { action: "create", data, id: scheduleId },
    headers: { origin },
  });
  expect(result.status()).toBe(200);
  const duplicate = await page.request.post("/api/admin/billing", {
    data: { action: "create", data, id: crypto.randomUUID() },
    headers: { origin },
  });
  expect(duplicate.status()).toBe(409);
  const records = await (
    await page.request.get("/api/admin/management")
  ).json();
  const schedule = records.rentSchedules.find(
    (r: { id: string }) => r.id === scheduleId
  );
  expect(schedule.status).toBe("awaiting_authorization");
  expect(schedule.stripeScheduleId).toBeNull();
  await page.setViewportSize({ height: 1080, width: 1920 });
  await page.goto("/admin#payments");
  await expect(
    page.getByRole("heading", { name: "Monthly rent payments" })
  ).toBeVisible();
  const billingForm = page.locator(".management-form:visible").first();
  const collection = billingForm.getByRole("button", {
    name: pattern1,
  });
  await collection.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("option", {
      exact: true,
      name: "Monthly invoice · tenant pays manually",
    })
  ).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("collection")
    )
  ).toBe("invoice");
  await billingForm.getByRole("button", { name: pattern2 }).click();
  await page
    .getByRole("option", { exact: true, name: "ACH TEST property" })
    .click();
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("propertyId")
    )
  ).toBe(propertyId);
  await billingForm.evaluate((form) => (form as HTMLFormElement).reset());
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("collection")
    )
  ).toBe("ach");
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("propertyId")
    )
  ).toBe("");
  expect(
    requireValue(
      await page.locator(".owner-sidebar").boundingBox(),
      "Expected (await page.locator(.owner-sidebar).boundingBox())"
    ).x
  ).toBe(0);
  await page.screenshot({
    fullPage: true,
    path: "test-results/owner-sidebar-left.png",
  });
  const url = new URL(schedule.enrollmentUrl);
  const enrollment = origin + url.pathname;
  const privateToken = url.pathname.split("/").pop();
  await page.goto(enrollment);
  await expect(
    page.getByRole("heading", { name: "Automatic ACH rent payments" })
  ).toBeVisible();
  await expect(
    page.getByText("Test mode. No real bank account will be debited.", {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByText(
      "I authorize Back Acres Rental to debit my US bank account",
      { exact: false }
    )
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/payments/autopay", {
        data: { action: "enroll", authorized: false, token: privateToken },
        headers: { origin },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/payments/autopay", {
        data: { action: "enroll", authorized: true, token: `${privateToken}x` },
        headers: { origin },
      })
    ).status()
  ).toBe(404);
  await page.setViewportSize({ height: 844, width: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  );
  await page.screenshot({
    fullPage: true,
    path: "test-results/ach-tenant-enrollment-mobile.png",
  });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Stop future automatic payments" })
    .click();
  await expect(
    page.getByText("Future automatic payments have stopped.", { exact: false })
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/payments/autopay", {
        data: { action: "enroll", authorized: true, token: privateToken },
        headers: { origin },
      })
    ).status()
  ).toBe(409);
  const [stored] =
    await sql`SELECT status,consented_at,stripe_schedule_id FROM rent_schedules WHERE id=${scheduleId}`;
  expect(stored.status).toBe("canceled");
  expect(stored.consented_at).toBeNull();
  expect(stored.stripe_schedule_id).toBeNull();
  await page.goto("/admin");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  );
});
