import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
import { blankNotice } from "../../lib/adverse/notice";
loadEnvConfig(process.cwd());
const origin = "http://localhost:3191",
  sql = neon(process.env.DATABASE_URL!);
const ids = Object.fromEntries(
  [
    "property",
    "application",
    "leaseTemplate",
    "leaseDraft",
    "leaseChild",
    "invoice",
    "rentSchedule",
    "residentLink",
    "maintenance",
    "notice",
    "noticeVersion",
  ].map((k) => [k, crypto.randomUUID()]),
);
const name = `REMOVAL TEST ${ids.property.slice(0, 8)}`,
  slug = `removal-${ids.property}`;
test.afterAll(async () => {
  await sql`DELETE FROM removed_records WHERE entity_id = ANY(${Object.values(ids)}::uuid[])`;
  await sql`DELETE FROM management_events WHERE entity_id = ANY(${Object.values(ids)}::uuid[])`;
  await sql`DELETE FROM maintenance_requests WHERE property_id=${ids.property}`;
  await sql`DELETE FROM resident_links WHERE property_id=${ids.property}`;
  await sql`DELETE FROM rental_applications WHERE property_id=${ids.property}`;
  await sql`DELETE FROM rental_invoices WHERE property_id=${ids.property}`;
  await sql`DELETE FROM rent_schedules WHERE property_id=${ids.property}`;
  await sql`DELETE FROM lease_drafts WHERE property_id=${ids.property}`;
  await sql`DELETE FROM lease_templates WHERE id=${ids.leaseTemplate}`;
  await sql`DELETE FROM adverse_notice_versions WHERE document_id=${ids.notice}`;
  await sql`DELETE FROM properties WHERE id=${ids.property}`;
});
test("remove and restore every workspace record; close listings and links, preserve versions and stop payment schedules", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  expect(
    (
      await request.post("/api/admin/removed", {
        data: { action: "remove", kind: "property", id: ids.property },
      })
    ).status(),
  ).toBe(401);
  await sql`INSERT INTO properties(id,slug,data) VALUES(${ids.property},${slug},${JSON.stringify({ name, slug, address: "1 Test Lane", rentCents: 100000, published: true, acceptingApplications: true, contact: "owner@example.invalid" })}::jsonb)`;
  await sql`INSERT INTO lease_templates(id,name,body) VALUES(${ids.leaseTemplate},${name},'Test lease')`;
  await sql`INSERT INTO lease_drafts(id,property_id,template_id,tenant_name,body) VALUES(${ids.leaseDraft},${ids.property},${ids.leaseTemplate},${name},'First test lease')`;
  await sql`INSERT INTO lease_drafts(id,property_id,template_id,parent_id,tenant_name,body) VALUES(${ids.leaseChild},${ids.property},${ids.leaseTemplate},${ids.leaseDraft},${name},'Second test lease')`;
  await sql`INSERT INTO rental_applications(id,property_id,data,criteria_snapshot,criteria_version,property_snapshot) VALUES(${ids.application},${ids.property},${JSON.stringify({ name, email: "test@example.invalid" })}::jsonb,'TEST','TEST','{}'::jsonb)`;
  await sql`INSERT INTO resident_links(id,property_id,resident_name,expires_at) VALUES(${ids.residentLink},${ids.property},${name},now()+interval '1 year')`;
  await sql`INSERT INTO maintenance_requests(id,property_id,resident_link_id,data) VALUES(${ids.maintenance},${ids.property},${ids.residentLink},${JSON.stringify({ subject: name, name, email: "test@example.invalid", priority: "routine", description: "Test" })}::jsonb)`;
  await sql`INSERT INTO rental_invoices(id,property_id,payer_name,payer_email,category,description,amount_cents,due_date) VALUES(${ids.invoice},${ids.property},${name},'test@example.invalid','rent',${name},100000,'2027-01-01')`;
  await sql`INSERT INTO rent_schedules(id,property_id,payer_name,payer_email,monthly_cents,first_date,installments,mode,status,collection) VALUES(${ids.rentSchedule},${ids.property},${name},'test@example.invalid',100000,'2027-01-01',12,'test','awaiting_authorization','ach')`;
  await sql`INSERT INTO adverse_notice_versions(id,document_id,version,notice,subject,html,plain_text) VALUES(${ids.noticeVersion},${ids.notice},1,${JSON.stringify({ ...blankNotice(), applicantName: name })}::jsonb,'Test','Test','Test')`;
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      googleVerified: true,
      sub: "removal-test",
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
  const api = async (data: unknown) =>
    page.request.post("/api/admin/removed", { headers: { origin }, data });
  const management = async () =>
    (await page.request.get("/api/admin/management")).json();
  expect(
    (
      await page.request.post("/api/admin/removed", {
        headers: { origin: "https://evil.example" },
        data: { action: "remove", kind: "property", id: ids.property },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await api({ action: "remove", kind: "invoice", id: ids.invoice })
    ).status(),
  ).toBe(409);
  expect(
    (
      await api({
        action: "remove",
        kind: "rentSchedule",
        id: ids.rentSchedule,
      })
    ).status(),
  ).toBe(409);
  await page.goto("/admin");
  await page
    .getByRole("button", { name: `Remove property: ${name}`, exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Remove property?");
  await dialog
    .getByRole("button", { name: "Keep property", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Remove property: ${name}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Remove property: ${name}`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remove property", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Stop this property’s rent schedules",
  );
  await dialog
    .getByRole("button", { name: "Keep property", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { name: "Payments", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Remove rent schedule: ${name}`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Stop payments & remove", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    (
      await sql`SELECT status FROM rent_schedules WHERE id=${ids.rentSchedule}`
    )[0].status,
  ).toBe("canceled");
  const before = await management();
  const residentUrl = before.residentLinks.find(
    (r: { id: string }) => r.id === ids.residentLink,
  ).url;
  // Canceling an open request must precede removal, including requests without a checkout session.
  await page
    .getByRole("button", {
      name: `Remove payment request: ${name}`,
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Cancel request & remove", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await sql`SELECT status FROM rental_invoices WHERE id=${ids.invoice}`)[0]
      .status,
  ).toBe("void");
  for (const kind of [
    "application",
    "leaseTemplate",
    "leaseDraft",
    "residentLink",
    "maintenance",
  ]) {
    const response = await api({ action: "remove", kind, id: ids[kind] });
    expect(response.status(), await response.text()).toBe(200);
  }
  await page.goto(`/admin/adverse-actions/${ids.notice}`);
  await page.getByLabel("Applicant full name").fill(`${name} unsaved edit`);
  let nativePrompt = false;
  page.on("dialog", async (d) => {
    nativePrompt = true;
    await d.dismiss();
  });
  await page
    .getByRole("button", {
      name: `Remove adverse-action notice: ${name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove adverse-action notice", exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/admin/adverse-actions`);
  expect(nativePrompt).toBe(false);
  const data = await management();
  for (const [key, kind] of [
    ["applications", "application"],
    ["templates", "leaseTemplate"],
    ["drafts", "leaseDraft"],
    ["residentLinks", "residentLink"],
    ["maintenance", "maintenance"],
    ["invoices", "invoice"],
    ["rentSchedules", "rentSchedule"],
  ])
    expect(data[key].some((r: { id: string }) => r.id === ids[kind])).toBe(
      false,
    );
  expect(data.drafts.some((r: { id: string }) => r.id === ids.leaseChild)).toBe(
    false,
  );
  expect(
    (
      await page.request.get(`/api/admin/leases/${ids.leaseChild}/pdf`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(`/api/admin/notices?documentId=${ids.notice}`)
    ).ok(),
  ).toBe(true);
  expect(
    (
      await (
        await page.request.get(`/api/admin/notices?documentId=${ids.notice}`)
      ).json()
    ).versions,
  ).toHaveLength(0);
  const removedParent = await page.request.post("/api/admin/notices", {
    headers: { origin },
    data: {
      notice: blankNotice(),
      parentId: ids.noticeVersion,
      requestId: crypto.randomUUID(),
    },
  });
  expect(removedParent.status()).toBe(404);
  // A stale property editor cannot republish a removed listing.
  await page.goto("/admin");
  await page
    .getByRole("button", { name: `Remove property: ${name}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove property", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Remove property: ${name}`, exact: true }),
  ).toHaveCount(0);
  expect((await request.get(`/properties/${slug}`)).status()).toBe(404);
  expect((await request.get(`/properties/${slug}/apply`)).status()).toBe(404);
  expect((await request.get(new URL(residentUrl).pathname)).status()).toBe(404);
  const stale = await page.request.post("/api/admin/management", {
    headers: { origin },
    data: {
      action: "residentLink",
      propertyId: ids.property,
      residentName: name,
    },
  });
  expect(stale.status()).toBe(409);
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { name: "Removed items", exact: true })
    .click();
  await page.reload(); // API-only fixture changes should be reflected in the workspace.
  const trash = page.getByRole("region", { name: "Removed items" });
  await expect(
    trash.getByRole("button", { name: "Restore property", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/removed-items.png",
    fullPage: false,
  });
  await trash
    .getByRole("button", { name: "Restore property", exact: true })
    .click();
  await expect(
    trash.getByRole("button", { name: "Restore property", exact: true }),
  ).toHaveCount(0);
  for (const kind of [
    "application",
    "leaseTemplate",
    "leaseDraft",
    "residentLink",
    "maintenance",
    "notice",
    "invoice",
    "rentSchedule",
  ])
    expect((await api({ action: "restore", id: ids[kind] })).status()).toBe(
      200,
    );
  const restored = await management();
  expect(
    restored.drafts.some((r: { id: string }) => r.id === ids.leaseChild),
  ).toBe(true);
  expect(
    restored.properties.find((r: { id: string }) => r.id === ids.property).data
      .published,
  ).toBe(false);
  expect(
    restored.residentLinks.find(
      (r: { id: string }) => r.id === ids.residentLink,
    ).revoked,
  ).toBe(true);
  expect(
    restored.rentSchedules.find(
      (r: { id: string }) => r.id === ids.rentSchedule,
    ).status,
  ).toBe("canceled");
  expect(
    (
      await (
        await page.request.get(`/api/admin/notices?documentId=${ids.notice}`)
      ).json()
    ).versions,
  ).toHaveLength(1);
  expect(
    (
      await page.request.get(`/api/admin/leases/${ids.leaseChild}/pdf`)
    ).status(),
  ).toBe(200);
});
