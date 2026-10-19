// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
import { requireValue } from "@/lib/required";

const pattern1 = /Choose a property/;
const pattern2 = /LEASE UX TEST property/;
const pattern3 = /Lease document/;
const pattern4 = /Fill tenant from an application/;
const pattern5 = /I reviewed these property statements/;
const pattern6 = /Insert a lease detail/;

import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  propertyId = crypto.randomUUID(),
  templateId = crypto.randomUUID(),
  applicantId = crypto.randomUUID();
const sql = neon(
  requireValue(process.env.DATABASE_URL, "Expected process.env.DATABASE_URL")
);
const wording =
  "LEASE DRAFT\n\nProperty: {{property_address}}\nTenant: {{tenant_names}}\nLandlord: {{landlord_name}}\nFrom {{start_date}} to {{end_date}}\nRent: {{monthly_rent}}\nDeposit: {{security_deposit}}\n\nProperty conditions: {{habitability_disclosure}}\nUtilities: {{utility_details}}";
const revisedName = `LEASE UX TEST revised ${propertyId}`;
const extraTemplateIds: string[] = [];
test.afterAll(async () => {
  await sql`DELETE FROM lease_drafts WHERE property_id=${propertyId}`;
  await sql`DELETE FROM rental_applications WHERE id=${applicantId}`;
  await sql`DELETE FROM lease_templates WHERE id=${templateId}`;
  await sql`DELETE FROM lease_templates WHERE name=${revisedName}`;
  for (const id of extraTemplateIds) {
    await sql`DELETE FROM lease_templates WHERE id=${id}`;
  }
  await sql`DELETE FROM properties WHERE id=${propertyId}`;
});
test("lease questions, applicant autofill, preview, durable versions and visual wording editor", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await sql`INSERT INTO properties(id,slug,data) VALUES(${propertyId},${`lease-ux-${propertyId}`},${JSON.stringify({ address: "123 Test Lane", contact: "owner@example.invalid", emergencyContact: "Owner test contact", name: "LEASE UX TEST property", published: false, rentCents: 250_000 })}::jsonb)`;
  await sql`INSERT INTO lease_templates(id,name,body) VALUES(${templateId},'LEASE UX TEST document',${wording})`;
  await sql`INSERT INTO rental_applications(id,property_id,data,criteria_snapshot,criteria_version,property_snapshot) VALUES(${applicantId},${propertyId},${JSON.stringify({ email: "lease-test@example.invalid", name: "LEASE UX TEST tenant" })}::jsonb,'TEST','TEST','{}'::jsonb)`;
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
      sub: "lease-test",
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
  await page.goto("/admin#leases");
  const workspace = page.locator(".lease-workspace");
  await workspace
    .getByRole("button", { exact: true, name: "New lease" })
    .click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Prepare a lease" })
  ).toBeVisible();
  await expect(workspace).not.toContainText("{{");
  await expect(
    page.getByRole("textbox", { exact: true, name: "Lease wording" })
  ).toHaveCount(0);
  await workspace.getByRole("button", { name: pattern1 }).click();
  await page.getByRole("option", { name: pattern2 }).click();
  await workspace.getByRole("button", { name: pattern3 }).click();
  await page
    .getByRole("option", { exact: true, name: "LEASE UX TEST document" })
    .click();
  await workspace.getByRole("button", { name: pattern4 }).click();
  await page
    .getByRole("option", { exact: true, name: "LEASE UX TEST tenant" })
    .click();
  await expect(
    page.getByLabel("Tenant legal names", { exact: true })
  ).toHaveValue("LEASE UX TEST tenant");
  await page
    .getByLabel("Landlord legal name", { exact: true })
    .fill("LEASE UX TEST owner");
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { exact: true, name: "Properties" })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { exact: true, name: "Leases" })
    .click();
  await expect(workspace).toBeVisible();
  await expect(
    page.getByLabel("Landlord legal name", { exact: true })
  ).toHaveValue("LEASE UX TEST owner");
  await page.screenshot({
    fullPage: false,
    path: "test-results/lease-guided-people.png",
  });
  await workspace
    .getByRole("button", { exact: true, name: "Continue" })
    .click();
  await expect(
    page.getByLabel("Monthly rent ($)", { exact: true })
  ).toHaveValue("2500");
  await page.getByLabel("Lease start date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Lease end date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Security deposit ($)", { exact: true }).fill("1500");
  await workspace
    .getByRole("button", { exact: true, name: "Continue" })
    .click();
  await expect(workspace.getByRole("alert")).toContainText(
    "end date must be after"
  );
  await page.getByLabel("Lease end date", { exact: true }).fill("2027-10-31");
  await workspace
    .getByRole("button", { exact: true, name: "Continue" })
    .click();
  for (const [label, text] of [
    ["Habitability disclosure", "TEST property condition details."],
    [
      "Utility responsibilities and disclosure details",
      "TEST utility allocation.",
    ],
  ]) {
    await page
      .locator(".lease-disclosure-card")
      .filter({ has: page.getByRole("heading", { exact: true, name: label }) })
      .getByRole("button", { exact: true, name: "Edit wording" })
      .click();
    await page.getByRole("textbox", { exact: true, name: label }).fill(text);
  }
  await page.getByRole("checkbox", { name: pattern5 }).check();
  await workspace
    .getByRole("button", { exact: true, name: "Review lease" })
    .click();
  await workspace
    .getByRole("button", { exact: true, name: "Read document" })
    .click();
  const preview = page.getByRole("article", { name: "Lease draft preview" });
  await expect(preview).toContainText("Rent: $2,500.00");
  await expect(preview).toContainText("Deposit: $1,500.00");
  await expect(preview).not.toContainText("{{");
  await workspace
    .getByRole("button", { exact: true, name: "Save lease draft" })
    .click();
  await expect(
    workspace.getByText("All changes saved", { exact: true })
  ).toBeVisible();
  let records = await (await page.request.get("/api/admin/management")).json();
  const original = records.drafts.find(
    (d: { propertyId: string }) => d.propertyId === propertyId
  );
  expect(original.values.security_deposit).toBe("$1,500.00");
  const pdf = await page.request.get(`/api/admin/leases/${original.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await workspace
    .getByRole("button", { exact: true, name: "Edit document text" })
    .click();
  await page
    .getByLabel("Lease document text", { exact: true })
    .fill(`${original.body}\n\nTEST owner revision.`);
  await workspace
    .getByRole("button", { exact: true, name: "Save new version" })
    .click();
  await expect(
    workspace.getByText("All changes saved", { exact: true })
  ).toBeVisible();
  records = await (await page.request.get("/api/admin/management")).json();
  const versions = records.drafts.filter(
    (d: { propertyId: string }) => d.propertyId === propertyId
  );
  expect(versions).toHaveLength(2);
  expect(
    versions.find((d: { parentId: string }) => d.parentId === original.id).body
  ).toContain("TEST owner revision.");
  expect(versions.find((d: { id: string }) => d.id === original.id).body).toBe(
    original.body
  );
  await workspace
    .getByRole("button", { exact: true, name: "Read document" })
    .click();
  await page.screenshot({
    fullPage: false,
    path: "test-results/lease-guided-review.png",
  });
  await page
    .getByRole("button", { exact: true, name: "Back to all leases" })
    .click();
  // Scope to this test's lease: a shared database can hold other drafts.
  await workspace
    .getByRole("article")
    .filter({ hasText: "LEASE UX TEST tenant" })
    .getByText("Earlier versions (1)", { exact: true })
    .click();
  await workspace
    .getByRole("button", { exact: true, name: "Open earlier version" })
    .click();
  await workspace
    .getByRole("button", { exact: true, name: "Read document" })
    .click();
  await expect(preview).not.toContainText("TEST owner revision.");
  await workspace
    .getByRole("button", { exact: true, name: "Edit lease details" })
    .click();
  await expect(
    page.getByLabel("Tenant legal names", { exact: true })
  ).toHaveValue("LEASE UX TEST tenant");
  await page
    .getByRole("button", { exact: true, name: "Back to all leases" })
    .click();
  await workspace
    .getByRole("button", { exact: true, name: "Lease wording" })
    .click();
  const editor = page.getByRole("textbox", {
    exact: true,
    name: "Lease wording",
  });
  await expect(editor).toBeVisible();
  await expect(editor).not.toContainText("{{");
  await expect(
    editor.locator('[data-lease-detail="property_address"]')
  ).toContainText("Property address");
  await page.getByLabel("Document name", { exact: true }).fill(revisedName);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: pattern6 }).click();
  await page
    .getByRole("option", { exact: true, name: "Landlord email" })
    .click();
  await workspace
    .getByRole("button", { exact: true, name: "Insert detail" })
    .click();
  await expect(
    editor.locator('[data-lease-detail="landlord_email"]')
  ).toContainText("Landlord email");
  await workspace
    .getByRole("button", { exact: true, name: "Save as a new document" })
    .click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Property & people" })
  ).toBeVisible();
  records = await (await page.request.get("/api/admin/management")).json();
  const revised = records.templates.find(
    (t: { name: string }) => t.name === revisedName
  );
  extraTemplateIds.push(revised.id);
  expect(revised.body).toContain("{{landlord_email}}");
  expect(
    records.templates.find((t: { id: string }) => t.id === templateId).body
  ).toBe(wording);
  await page.setViewportSize({ height: 844, width: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    fullPage: false,
    path: "test-results/lease-guided-mobile.png",
  });
});
