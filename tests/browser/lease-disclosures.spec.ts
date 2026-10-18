import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
import { availLeaseTemplate } from "../../lib/leases/avail-template";
loadEnvConfig(process.cwd());
const sql = neon(process.env.DATABASE_URL!),
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
  test.setTimeout(90000);
  await sql`INSERT INTO properties(id,slug,data) VALUES(${propertyId},${"disclosure-" + propertyId},${JSON.stringify({ name, address: "7800 Back Acres Rd. Amarillo Texas 79119", rentCents: 250000, published: false, contact: "test@example.invalid", emergencyContact: "Test contact" })}::jsonb)`;
  await sql`INSERT INTO lease_templates(id,name,body) VALUES(${templateId},${name},${availLeaseTemplate})`;
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      googleVerified: true,
      sub: "disclosure-test",
    },
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
  await page.setViewportSize({ width: 1440, height: 1050 });
  async function toDisclosures() {
    await page
      .getByRole("heading", { name: "Property & people", exact: true })
      .waitFor();
    await page
      .getByRole("button", {
        name: /Property.*Choose a property|Choose a property.*Property/,
      })
      .click();
    await page.getByRole("option", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: /Lease document/ }).click();
    await page.getByRole("option", { name, exact: true }).click();
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
    await page.getByRole("button", { name: "Continue", exact: true }).click();
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
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.goto("/admin#leases");
  await toDisclosures();
  const cards = page.locator(".lease-disclosure-card");
  await expect(cards).toHaveCount(9);
  await expect(
    page.getByText("No known conditions affecting habitability.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Flood Disclosure", exact: true }),
  ).toBeChecked();
  const habitability = cards.filter({
    has: page.getByRole("heading", {
      name: "Habitability disclosure",
      exact: true,
    }),
  });
  await habitability
    .getByRole("button", { name: "Edit wording", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Habitability disclosure", exact: true })
    .fill("Owner-reviewed fixture disclosure.");
  await habitability
    .getByRole("button", { name: "Done editing", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I reviewed these property statements/ })
    .check();
  await page
    .getByRole("button", {
      name: "Save disclosures for this property",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "New leases for this property" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await toDisclosures();
  await expect(
    page.getByText("Owner-reviewed fixture disclosure.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Loaded the saved disclosures for this property.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/lease-disclosures.png",
    fullPage: false,
  });
  await page
    .getByRole("checkbox", { name: /I reviewed these property statements/ })
    .check();
  await page.getByRole("button", { name: "Review lease", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Lease document text",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("BOLD lease fixture note");
  await page.keyboard.press("Shift+Home");
  await page
    .getByRole("toolbar", { name: "Lease document text formatting" })
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await expect(editor.locator("strong")).toContainText(
    "BOLD lease fixture note",
  );
  await page
    .getByRole("button", { name: "Save lease draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Draft saved", exact: true }),
  ).toBeVisible();
  const records = await (
      await page.request.get("/api/admin/management")
    ).json(),
    draft = records.drafts.find(
      (d: { propertyId: string }) => d.propertyId === propertyId,
    );
  expect(draft.body.length).toBeGreaterThan(42000);
  expect(JSON.stringify(draft.document)).toContain('"bold"');
  await page.getByRole("button", { name: "Open lease", exact: true }).click();
  await expect(editor.locator("strong")).toContainText(
    "BOLD lease fixture note",
  );
  const pdf = await page.request.get(`/api/admin/leases/${draft.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page
    .getByRole("button", { name: "Read document", exact: true })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Lease draft preview" })
      .locator("strong"),
  ).toContainText("BOLD lease fixture note");
  await page.screenshot({
    path: "test-results/lease-tiptap-preview.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Edit document text", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/lease-tiptap-editor.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
