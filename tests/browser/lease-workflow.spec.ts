import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  propertyId = crypto.randomUUID(),
  templateId = crypto.randomUUID(),
  applicantId = crypto.randomUUID();
const sql = neon(process.env.DATABASE_URL!);
const wording =
  "LEASE DRAFT\n\nProperty: {{property_address}}\nTenant: {{tenant_names}}\nLandlord: {{landlord_name}}\nFrom {{start_date}} to {{end_date}}\nRent: {{monthly_rent}}\nDeposit: {{security_deposit}}\n\nProperty conditions: {{habitability_disclosure}}\nUtilities: {{utility_details}}";
const revisedName = `LEASE UX TEST revised ${propertyId}`;
const extraTemplateIds: string[] = [];
test.afterAll(async () => {
  await sql`DELETE FROM lease_drafts WHERE property_id=${propertyId}`;
  await sql`DELETE FROM rental_applications WHERE id=${applicantId}`;
  await sql`DELETE FROM lease_templates WHERE id=${templateId}`;
  await sql`DELETE FROM lease_templates WHERE name=${revisedName}`;
  for (const id of extraTemplateIds)
    await sql`DELETE FROM lease_templates WHERE id=${id}`;
  await sql`DELETE FROM properties WHERE id=${propertyId}`;
});
test("lease questions, applicant autofill, preview, durable versions and visual wording editor", async ({
  page,
}) => {
  test.setTimeout(60000);
  await sql`INSERT INTO properties(id,slug,data) VALUES(${propertyId},${"lease-ux-" + propertyId},${JSON.stringify({ name: "LEASE UX TEST property", address: "123 Test Lane", rentCents: 250000, emergencyContact: "Owner test contact", contact: "owner@example.invalid", published: false })}::jsonb)`;
  await sql`INSERT INTO lease_templates(id,name,body) VALUES(${templateId},'LEASE UX TEST document',${wording})`;
  await sql`INSERT INTO rental_applications(id,property_id,data,criteria_snapshot,criteria_version,property_snapshot) VALUES(${applicantId},${propertyId},${JSON.stringify({ name: "LEASE UX TEST tenant", email: "lease-test@example.invalid" })}::jsonb,'TEST','TEST','{}'::jsonb)`;
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      sub: "lease-test",
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
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/admin#leases");
  const workspace = page.locator(".lease-workspace");
  await expect(
    page.getByRole("heading", { name: "Prepare a lease", exact: true }),
  ).toBeVisible();
  await expect(workspace).not.toContainText("{{");
  await expect(
    page.getByRole("textbox", { name: "Lease wording", exact: true }),
  ).toHaveCount(0);
  await workspace.getByRole("button", { name: /Choose a property/ }).click();
  await page.getByRole("option", { name: /LEASE UX TEST property/ }).click();
  await workspace.getByRole("button", { name: /Lease document/ }).click();
  await page
    .getByRole("option", { name: "LEASE UX TEST document", exact: true })
    .click();
  await workspace
    .getByRole("button", { name: /Fill tenant from an application/ })
    .click();
  await page
    .getByRole("option", { name: "LEASE UX TEST tenant", exact: true })
    .click();
  await expect(
    page.getByLabel("Tenant legal names", { exact: true }),
  ).toHaveValue("LEASE UX TEST tenant");
  await page
    .getByLabel("Landlord legal name", { exact: true })
    .fill("LEASE UX TEST owner");
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { name: "Properties", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { name: "Leases", exact: true })
    .click();
  await expect(workspace).toBeVisible();
  await expect(
    page.getByLabel("Landlord legal name", { exact: true }),
  ).toHaveValue("LEASE UX TEST owner");
  await page.screenshot({
    path: "test-results/lease-guided-people.png",
    fullPage: false,
  });
  await workspace
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(
    page.getByLabel("Monthly rent ($)", { exact: true }),
  ).toHaveValue("2500");
  await page.getByLabel("Lease start date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Lease end date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Security deposit ($)", { exact: true }).fill("1500");
  await workspace
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(workspace.getByRole("alert")).toContainText(
    "end date must be after",
  );
  await page.getByLabel("Lease end date", { exact: true }).fill("2027-10-31");
  await workspace
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await page
    .getByLabel("Habitability disclosure", { exact: true })
    .fill("TEST property condition details.");
  await page
    .getByLabel("Utility responsibilities and disclosure details", {
      exact: true,
    })
    .fill("TEST utility allocation.");
  await workspace
    .getByRole("button", { name: "Review lease", exact: true })
    .click();
  const preview = page.getByRole("article", { name: "Lease draft preview" });
  await expect(preview).toContainText("Rent: $2,500.00");
  await expect(preview).toContainText("Deposit: $1,500.00");
  await expect(preview).not.toContainText("{{");
  await workspace
    .getByRole("button", { name: "Save lease draft", exact: true })
    .click();
  await expect(
    workspace.getByRole("button", { name: "Draft saved", exact: true }),
  ).toBeVisible();
  let records = await (await page.request.get("/api/admin/management")).json();
  const original = records.drafts.find(
    (d: { propertyId: string }) => d.propertyId === propertyId,
  );
  expect(original.values.security_deposit).toBe("$1,500.00");
  const pdf = await page.request.get(`/api/admin/leases/${original.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await workspace
    .getByRole("button", { name: "Edit document text", exact: true })
    .click();
  await page
    .getByLabel("Lease document text", { exact: true })
    .fill(original.body + "\n\nTEST owner revision.");
  await workspace
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(
    workspace.getByRole("button", { name: "Draft saved", exact: true }),
  ).toBeVisible();
  records = await (await page.request.get("/api/admin/management")).json();
  const versions = records.drafts.filter(
    (d: { propertyId: string }) => d.propertyId === propertyId,
  );
  expect(versions).toHaveLength(2);
  expect(
    versions.find((d: { parentId: string }) => d.parentId === original.id).body,
  ).toContain("TEST owner revision.");
  expect(versions.find((d: { id: string }) => d.id === original.id).body).toBe(
    original.body,
  );
  await workspace
    .getByRole("button", { name: "Read document", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/lease-guided-review.png",
    fullPage: false,
  });
  await workspace.getByText("Earlier versions (1)", { exact: true }).click();
  await workspace
    .getByRole("button", { name: "Open earlier version", exact: true })
    .click();
  await expect(preview).not.toContainText("TEST owner revision.");
  await workspace
    .getByRole("button", { name: "Edit lease details", exact: true })
    .click();
  await expect(
    page.getByLabel("Tenant legal names", { exact: true }),
  ).toHaveValue("LEASE UX TEST tenant");
  await workspace
    .getByRole("button", { name: "Lease wording", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Lease wording",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(editor).not.toContainText("{{");
  await expect(
    editor.locator('[data-lease-detail="property_address"]'),
  ).toContainText("Property address");
  await page.getByLabel("Document name", { exact: true }).fill(revisedName);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Insert a lease detail/ }).click();
  await page
    .getByRole("option", { name: "Landlord email", exact: true })
    .click();
  await workspace
    .getByRole("button", { name: "Insert detail", exact: true })
    .click();
  await expect(
    editor.locator('[data-lease-detail="landlord_email"]'),
  ).toContainText("Landlord email");
  await workspace
    .getByRole("button", { name: "Save as a new document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Property & people", exact: true }),
  ).toBeVisible();
  records = await (await page.request.get("/api/admin/management")).json();
  const revised = records.templates.find(
    (t: { name: string }) => t.name === revisedName,
  );
  extraTemplateIds.push(revised.id);
  expect(revised.body).toContain("{{landlord_email}}");
  expect(
    records.templates.find((t: { id: string }) => t.id === templateId).body,
  ).toBe(wording);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/lease-guided-mobile.png",
    fullPage: false,
  });
});
