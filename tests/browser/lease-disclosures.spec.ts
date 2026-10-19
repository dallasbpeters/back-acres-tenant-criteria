import { requireValue } from "@/lib/required";

const pattern1 = /Property.*Choose a property|Choose a property.*Property/;
const pattern2 = /Lease document/;
const pattern3 = /I reviewed these property statements/;
const pattern4 = /I reviewed these property statements/;

import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { availLeaseTemplate } from "../../lib/leases/avail-template";

loadEnvConfig(process.cwd());
const sql = neon(
    requireValue(process.env.DATABASE_URL, "Expected process.env.DATABASE_URL")
  ),
  propertyId = crypto.randomUUID(),
  templateId = crypto.randomUUID(),
  name = `DISCLOSURE TEST ${propertyId.slice(0, 8)}`,
  origin = "http://localhost:3191";
test.afterAll(async () => {
  await sql`DELETE FROM lease_drafts WHERE property_id=${propertyId}`;
  await sql`DELETE FROM lease_templates WHERE id=${templateId}`;
  await sql`DELETE FROM management_events WHERE entity_id=${propertyId}`;
  await sql`DELETE FROM properties WHERE id=${propertyId}`;
});
test("supplied disclosures, reusable property defaults, visible Tiptap and formatted full-length lease save/reopen/export", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await sql`INSERT INTO properties(id,slug,data) VALUES(${propertyId},${`disclosure-${propertyId}`},${JSON.stringify({ address: "7800 Back Acres Rd. Amarillo Texas 79119", contact: "test@example.invalid", emergencyContact: "Test contact", name, published: false, rentCents: 250_000 })}::jsonb)`;
  await sql`INSERT INTO lease_templates(id,name,body) VALUES(${templateId},${name},${availLeaseTemplate})`;
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
      sub: "disclosure-test",
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
  await page.setViewportSize({ height: 1050, width: 1440 });
  async function toDisclosures() {
    await page.getByRole("button", { exact: true, name: "New lease" }).click();
    await page
      .getByRole("heading", { exact: true, name: "Property & people" })
      .waitFor();
    await page
      .getByRole("button", {
        name: pattern1,
      })
      .click();
    await page.getByRole("option", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: pattern2 }).click();
    await page.getByRole("option", { exact: true, name }).click();
    await page.getByLabel("Tenant legal names", { exact: true }).fill(name);
    await page
      .getByLabel("Landlord legal name", { exact: true })
      .fill("Test landlord");
    await page
      .getByLabel("Landlord email", { exact: true })
      .fill("test@example.invalid");
    await page.getByLabel("Landlord phone", { exact: true }).fill("555-0100");
    await page
      .getByLabel("Landlord notice address", { exact: true })
      .fill("1 Test Street");
    await page.getByRole("button", { exact: true, name: "Continue" }).click();
    await page
      .getByLabel("Lease start date", { exact: true })
      .fill("2027-01-01");
    await page.getByLabel("Lease end date", { exact: true }).fill("2027-12-31");
    await page.getByLabel("Security deposit ($)", { exact: true }).fill("1500");
    await page
      .getByLabel("Late fee", { exact: true })
      .fill("See lease clause.");
    await page
      .getByLabel("Payment instructions", { exact: true })
      .fill("Private payment link.");
    await page.getByRole("button", { exact: true, name: "Continue" }).click();
  }
  await page.goto("/admin#leases");
  await toDisclosures();
  const cards = page.locator(".lease-disclosure-card");
  await expect(cards).toHaveCount(9);
  await expect(
    page.getByText("No known conditions affecting habitability.", {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { exact: true, name: "Flood Disclosure" })
  ).toBeChecked();
  const habitability = cards.filter({
    has: page.getByRole("heading", {
      exact: true,
      name: "Habitability disclosure",
    }),
  });
  await habitability
    .getByRole("button", { exact: true, name: "Edit wording" })
    .click();
  await page
    .getByRole("textbox", { exact: true, name: "Habitability disclosure" })
    .fill("Owner-reviewed fixture disclosure.");
  await habitability
    .getByRole("button", { exact: true, name: "Done editing" })
    .click();
  await page.getByRole("checkbox", { name: pattern3 }).check();
  await page
    .getByRole("button", {
      exact: true,
      name: "Save disclosures for this property",
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "New leases for this property" })
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await toDisclosures();
  await expect(
    page.getByText("Owner-reviewed fixture disclosure.", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Loaded the saved disclosures for this property.", {
      exact: true,
    })
  ).toBeVisible();
  await page.screenshot({
    fullPage: false,
    path: "test-results/lease-disclosures.png",
  });
  await page.getByRole("checkbox", { name: pattern4 }).check();
  await page.getByRole("button", { exact: true, name: "Review lease" }).click();
  const editor = page.getByRole("textbox", {
    exact: true,
    name: "Lease document text",
  });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("BOLD lease fixture note");
  await page.keyboard.press("Shift+Home");
  await page
    .getByRole("toolbar", { name: "Lease document text formatting" })
    .getByRole("button", { exact: true, name: "Bold" })
    .click();
  await expect(editor.locator("strong")).toContainText(
    "BOLD lease fixture note"
  );
  await page
    .getByRole("button", { exact: true, name: "Save lease draft" })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true })
  ).toBeVisible();
  const records = await (
      await page.request.get("/api/admin/management")
    ).json(),
    draft = records.drafts.find(
      (d: { propertyId: string }) => d.propertyId === propertyId
    );
  expect(draft.body.length).toBeGreaterThan(42_000);
  expect(JSON.stringify(draft.document)).toContain('"bold"');
  await page
    .getByRole("button", { exact: true, name: "Back to all leases" })
    .click();
  await page
    .locator(".lease-saved .record")
    .filter({ has: page.getByRole("heading", { exact: true, name }) })
    .getByRole("button", { exact: true, name: "Open lease" })
    .click();
  await expect(editor.locator("strong")).toContainText(
    "BOLD lease fixture note"
  );
  const pdf = await page.request.get(`/api/admin/leases/${draft.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page
    .getByRole("button", { exact: true, name: "Read document" })
    .click();
  await expect(
    page.getByRole("article", { name: "Lease draft preview" }).locator("strong")
  ).toContainText("BOLD lease fixture note");
  await page.screenshot({
    fullPage: false,
    path: "test-results/lease-tiptap-preview.png",
  });
  await page
    .getByRole("button", { exact: true, name: "Edit document text" })
    .click();
  await page.screenshot({
    fullPage: false,
    path: "test-results/lease-tiptap-editor.png",
  });
  await page.setViewportSize({ height: 844, width: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});
