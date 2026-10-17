import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
loadEnvConfig(process.cwd());
const origin = "http://localhost:3191";
const sql = neon(process.env.DATABASE_URL!);
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
    (await request.post("/api/admin/billing", { data: {} })).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/payments/autopay", {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await sql`INSERT INTO properties(id,slug,data) VALUES (${propertyId},${"ach-test-" + propertyId},${JSON.stringify({ name: "ACH TEST property", address: "1 Test Lane", contact: "owner@example.invalid" })}::jsonb)`;
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      sub: "test-owner",
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
  const firstDate = new Date();
  firstDate.setUTCMonth(firstDate.getUTCMonth() + 1, 10);
  const data = {
    propertyId,
    payerName: "ACH TEST payer",
    payerEmail: "ach-test@example.invalid",
    monthlyCents: 100,
    firstDate: firstDate.toISOString().slice(0, 10),
    installments: 2,
    authorized: true,
    collection: "ach",
  };
  const result = await page.request.post("/api/admin/billing", {
    headers: { origin },
    data: { action: "create", id: scheduleId, data },
  });
  expect(result.status()).toBe(200);
  const duplicate = await page.request.post("/api/admin/billing", {
    headers: { origin },
    data: { action: "create", id: crypto.randomUUID(), data },
  });
  expect(duplicate.status()).toBe(409);
  const records = await (
    await page.request.get("/api/admin/management")
  ).json();
  const schedule = records.rentSchedules.find(
    (r: { id: string }) => r.id === scheduleId,
  );
  expect(schedule.status).toBe("awaiting_authorization");
  expect(schedule.stripeScheduleId).toBeNull();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/admin#payments");
  await expect(
    page.getByRole("heading", { name: "Monthly rent payments" }),
  ).toBeVisible();
  const billingForm = page.locator(".management-form").first();
  const collection = billingForm.getByRole("button", {
    name: /Payment collection/,
  });
  await collection.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("option", {
      name: "Monthly invoice · tenant pays manually",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("collection"),
    ),
  ).toBe("invoice");
  await billingForm.getByRole("button", { name: /property/i }).click();
  await page
    .getByRole("option", { name: "ACH TEST property", exact: true })
    .click();
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("propertyId"),
    ),
  ).toBe(propertyId);
  await billingForm.evaluate((form) => (form as HTMLFormElement).reset());
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("collection"),
    ),
  ).toBe("ach");
  expect(
    await billingForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).get("propertyId"),
    ),
  ).toBe("");
  expect((await page.locator(".owner-sidebar").boundingBox())!.x).toBe(0);
  await page.screenshot({
    path: "test-results/owner-sidebar-left.png",
    fullPage: true,
  });
  const url = new URL(schedule.enrollmentUrl);
  const enrollment = origin + url.pathname;
  const privateToken = url.pathname.split("/").pop();
  await page.goto(enrollment);
  await expect(
    page.getByRole("heading", { name: "Automatic ACH rent payments" }),
  ).toBeVisible();
  await expect(
    page.getByText("Test mode. No real bank account will be debited.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "I authorize Back Acres Rental to debit my US bank account",
      { exact: false },
    ),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/payments/autopay", {
        headers: { origin },
        data: { action: "enroll", token: privateToken, authorized: false },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/payments/autopay", {
        headers: { origin },
        data: { action: "enroll", token: privateToken + "x", authorized: true },
      })
    ).status(),
  ).toBe(404);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "test-results/ach-tenant-enrollment-mobile.png",
    fullPage: true,
  });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Stop future automatic payments" })
    .click();
  await expect(
    page.getByText("Future automatic payments have stopped.", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/payments/autopay", {
        headers: { origin },
        data: { action: "enroll", token: privateToken, authorized: true },
      })
    ).status(),
  ).toBe(409);
  const [stored] =
    await sql`SELECT status,consented_at,stripe_schedule_id FROM rent_schedules WHERE id=${scheduleId}`;
  expect(stored.status).toBe("canceled");
  expect(stored.consented_at).toBeNull();
  expect(stored.stripe_schedule_id).toBeNull();
  await page.goto("/admin");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
