// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.

import { requireValue } from "@/lib/required";
import { retireTestProperty } from "./retire-property";

const pattern1 = /property/i;
const pattern2 = /Lease document/;

import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import Stripe from "stripe";
import { POLICY, selectionCriteriaText } from "../../lib/policy";

loadEnvConfig(process.cwd());
const origin = "http://localhost:3191";
const propertyId = crypto.randomUUID(),
  applicationId = crypto.randomUUID(),
  invoiceId = crypto.randomUUID(),
  templateId = crypto.randomUUID();
const slug = `1-test-st-unit-${propertyId.slice(0, 8)}`;
const canceledInvoiceId = crypto.randomUUID();
const duplicatePropertyId = crypto.randomUUID();
let linkId = "",
  draftId = "";
const sql = neon(
  requireValue(process.env.DATABASE_URL, "Expected process.env.DATABASE_URL")
);
test.afterAll(async () => {
  await sql`DELETE FROM maintenance_requests WHERE property_id=${propertyId}`;
  await sql`DELETE FROM resident_links WHERE property_id=${propertyId}`;
  await sql`DELETE FROM rental_applications WHERE property_id=${propertyId}`;
  await sql`DELETE FROM lease_drafts WHERE property_id=${propertyId}`;
  await sql`DELETE FROM lease_templates WHERE id=${templateId}`;
  await sql`DELETE FROM management_events WHERE entity_id IN (${propertyId},${applicationId},${invoiceId},${canceledInvoiceId},${linkId || propertyId},${draftId || propertyId})`;
  await sql`DELETE FROM management_events WHERE entity_id=${duplicatePropertyId}`;
  await retireTestProperty(sql, propertyId, "MANAGEMENT TEST");
  await retireTestProperty(sql, duplicatePropertyId, "MANAGEMENT TEST");
});
test("property lifecycle, private records, public applications, resident links, drafts and signed payments", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  expect(
    (await request.post("/api/admin/billing", { data: {} })).status()
  ).toBe(401);
  expect((await request.get("/api/admin/management")).status()).toBe(401);
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
  const send = (dataLocal: unknown) =>
    page.request.post("/api/admin/management", {
      data: dataLocal,
      headers: { origin, "x-vercel-forwarded-for": propertyId },
    });
  expect(
    (
      await page.request.post("/api/admin/management", {
        data: {},
        headers: { origin: "https://evil.example" },
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/admin/billing", {
        data: {},
        headers: { origin: "https://evil.example" },
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/admin/billing", {
        data: {
          action: "create",
          data: { authorized: false },
          id: crypto.randomUUID(),
        },
        headers: { origin },
      })
    ).status()
  ).toBe(400);
  const property = {
    acceptingApplications: false,
    address: `1 Test St, Unit ${propertyId.slice(0, 8)}`,
    availableDate: "2026-11-01",
    bathrooms: 2,
    bedrooms: 3,
    contact: "owner@example.invalid",
    criteria: "Test criteria version 1",
    criteriaVersion: "TEST-1",
    description: "A test listing",
    emergencyContact: "Contact owner directly",
    name: "Test property",
    published: false,
    rentCents: 250_000,
    slug,
  };
  expect(
    (
      await send({
        action: "property",
        data: property,
        id: propertyId,
        revision: 0,
      })
    ).ok()
  ).toBe(true);
  expect((await request.get(`/properties/${slug}`)).status()).toBe(404);
  expect(
    (
      await send({
        action: "property",
        data: { ...property, acceptingApplications: true, published: true },
        id: propertyId,
        revision: 1,
      })
    ).ok()
  ).toBe(true);
  expect(
    (
      await send({
        action: "property",
        data: property,
        id: propertyId,
        revision: 1,
      })
    ).status()
  ).toBe(409);
  await page.goto(`/properties/${slug}/apply`);
  await expect(
    page.getByRole("heading", { name: "Selection criteria" })
  ).toBeVisible();
  const data = {
    accuracy: true,
    acknowledgment: true,
    currentAddress: "2 Test St",
    email: "fixture@example.invalid",
    housingHistory: "Fixture history",
    incomeDetails: "Fixture income",
    monthlyIncome: 8000,
    moveDate: "2026-11-01",
    name: "Fixture applicant",
    notes: "",
    occupants: 2,
    phone: "555-0100",
  };
  const apply = (revision: number, criteriaVersion: string = POLICY.version) =>
    request.post("/api/applications", {
      data: {
        criteriaVersion,
        data,
        id: applicationId,
        propertyId,
        revision,
        website: "",
      },
      headers: { origin, "x-vercel-forwarded-for": propertyId },
    });
  expect((await apply(1)).status()).toBe(409);
  expect((await apply(2, "stale-version")).status()).toBe(409);
  expect((await apply(2)).status()).toBe(201);
  expect((await apply(2)).status()).toBe(201);
  const rows =
    await sql`SELECT * FROM rental_applications WHERE id=${applicationId}`;
  expect(rows).toHaveLength(1);
  expect(rows[0].criteria_snapshot).toBe(selectionCriteriaText());
  expect(rows[0].criteria_version).toBe(POLICY.version);
  expect((await request.get("/api/admin/management")).status()).toBe(401);
  expect(
    (
      await send({
        action: "residentLink",
        propertyId,
        residentName: "Fixture resident",
      })
    ).ok()
  ).toBe(true);
  let records = await (await page.request.get("/api/admin/management")).json();
  const link = records.residentLinks.find(
    (l: { propertyId: string }) => l.propertyId === propertyId
  );
  linkId = link.id;
  const residentToken = link.url.split("/").pop();
  const maintenance = {
    data: {
      accessNotes: "Call first",
      description: "Test only",
      email: "fixture@example.invalid",
      name: "Fixture resident",
      phone: "555-0100",
      priority: "routine",
      subject: "Fixture repair",
    },
    id: crypto.randomUUID(),
    token: residentToken,
    website: "",
  };
  expect(
    (
      await request.post("/api/maintenance", {
        data: { ...maintenance, token: `${residentToken}x` },
        headers: { origin, "x-vercel-forwarded-for": propertyId },
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.post("/api/maintenance", {
        data: maintenance,
        headers: { origin, "x-vercel-forwarded-for": propertyId },
      })
    ).status()
  ).toBe(201);
  await send({ action: "revokeLink", id: link.id });
  expect(
    (
      await request.post("/api/maintenance", {
        data: maintenance,
        headers: { origin, "x-vercel-forwarded-for": propertyId },
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await send({
        action: "leaseTemplate",
        body: "Lease for {{tenant_names}} at {{property_address}}.",
        id: templateId,
        name: "Fixture template",
      })
    ).ok()
  ).toBe(true);
  await page.goto("/admin");
  await page.getByRole("link", { exact: true, name: "Leases" }).click();
  await page.getByRole("button", { exact: true, name: "New lease" }).click();
  await page
    .locator(".lease-form")
    .getByRole("button", { name: pattern1 })
    .click();
  await page
    .getByRole("option", {
      name: new RegExp(`Test property.*${propertyId.slice(0, 8)}`),
    })
    .click();
  await page.getByRole("button", { name: pattern2 }).click();
  await page
    .getByRole("option", { exact: true, name: "Fixture template" })
    .click();
  await page.getByLabel("Landlord legal name").fill("Fixture owner");
  await page.getByLabel("Tenant legal names").fill("Fixture tenant");
  await page.getByRole("button", { exact: true, name: "Continue" }).click();
  await page.getByLabel("Lease start date").fill("2026-11-01");
  await page.getByLabel("Lease end date").fill("2027-10-31");
  await page.getByLabel("Security deposit ($)", { exact: true }).fill("2500");
  await page.getByRole("button", { exact: true, name: "Continue" }).click();
  await page.getByRole("button", { exact: true, name: "Review lease" }).click();
  await page
    .getByRole("button", { exact: true, name: "Read document" })
    .click();
  await expect(
    page.getByRole("article", { name: "Lease draft preview" })
  ).toContainText(`Lease for Fixture tenant at ${property.address}.`);
  await page
    .getByRole("button", { exact: true, name: "Save lease draft" })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true })
  ).toBeVisible();
  records = await (await page.request.get("/api/admin/management")).json();
  draftId = records.drafts.find(
    (d: { propertyId: string }) => d.propertyId === propertyId
  ).id;
  expect(
    (
      await send({
        action: "invoice",
        data: {
          amountCents: 250_000,
          category: "rent",
          description: "Test rent",
          dueDate: "2026-11-01",
          payerEmail: "fixture@example.invalid",
          payerName: "Fixture tenant",
          propertyId,
        },
        id: invoiceId,
      })
    ).ok()
  ).toBe(true);
  expect(
    (
      await send({
        action: "invoice",
        data: {
          amountCents: 1000,
          category: "rent",
          description: "Canceled fixture",
          dueDate: "2026-11-01",
          payerEmail: "fixture@example.invalid",
          payerName: "Fixture",
          propertyId,
        },
        id: canceledInvoiceId,
      })
    ).ok()
  ).toBe(true);
  expect(
    (await send({ action: "voidInvoice", id: canceledInvoiceId })).ok()
  ).toBe(true);
  records = await (await page.request.get("/api/admin/management")).json();
  const canceled = records.invoices.find(
    (i: { id: string }) => i.id === canceledInvoiceId
  );
  expect(
    (
      await request.post("/api/payments/checkout", {
        data: { token: canceled.url.split("/").pop() },
        headers: { origin },
      })
    ).status()
  ).toBe(410);
  expect(
    (
      await request.post("/api/payments/webhook", {
        data: { type: "checkout.session.completed" },
      })
    ).status()
  ).toBe(400);
  if (process.env.STRIPE_WEBHOOK_SECRET === "whsec_test_only") {
    const stripe = new Stripe("sk_test_fixture");
    const event = {
      data: {
        object: {
          amount_total: 250_000,
          client_reference_id: invoiceId,
          currency: "usd",
          // Real Checkout sessions and events have unique IDs; test invoices persist.
          id: `cs_test_${invoiceId}`,
          livemode: false,
          metadata: { invoiceId },
          object: "checkout.session",
          payment_status: "paid",
        },
      },
      id: `evt_${invoiceId}`,
      object: "event",
      type: "checkout.session.completed",
    };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_test_only",
    });
    for (let i = 0; i < 2; i += 1) {
      expect(
        (
          await request.post("/api/payments/webhook", {
            data: payload,
            headers: {
              "Content-Type": "application/json",
              "stripe-signature": signature,
            },
          })
        ).status()
      ).toBe(200);
    }
    const paid =
      await sql`SELECT status FROM rental_invoices WHERE id=${invoiceId}`;
    expect(paid[0].status).toBe("paid");
  }
  const {
    slug: ignoredSlug,
    emergencyContact: ignoredEmergencyContact,
    criteria: ignoredCriteria,
    criteriaVersion: ignoredCriteriaVersion,
    ...automaticProperty
  } = property;
  expect(
    (
      await send({
        action: "property",
        data: automaticProperty,
        id: duplicatePropertyId,
        revision: 0,
      })
    ).ok()
  ).toBe(true);
  let listingRecords = await (
    await page.request.get("/api/admin/management")
  ).json();
  const duplicate = listingRecords.properties.find(
    (p: { id: string }) => p.id === duplicatePropertyId
  );
  expect(duplicate.slug).toBe(
    `${slug}-${duplicatePropertyId.replaceAll("-", "")}`
  );
  expect(
    (
      await send({
        action: "property",
        data: {
          ...automaticProperty,
          address: "Corrected address",
          published: true,
        },
        id: propertyId,
        revision: 2,
      })
    ).ok()
  ).toBe(true);
  listingRecords = await (
    await page.request.get("/api/admin/management")
  ).json();
  expect(
    listingRecords.properties.find((p: { id: string }) => p.id === propertyId)
      .slug
  ).toBe(slug);
  expect((await request.get(`/properties/${slug}`)).ok()).toBe(true);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("link", { exact: true, name: "Properties" })
    .click();
  await page.getByRole("button", { exact: true, name: "Add property" }).click();
  await expect(
    page.getByLabel("Listing URL name", { exact: false })
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Your listing link is generated automatically from the property address when you save."
    )
  ).toBeVisible();

  await expect(
    page.getByLabel("Urgent repair contact", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { exact: true, name: "Open maintenance portal" })
  ).toHaveAttribute("href", "/admin#maintenance");
  await expect(
    page.getByLabel("Selection criteria for this property", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Criteria version", { exact: true })
  ).toHaveCount(0);
  const portalPage = await page.context().newPage();
  await portalPage.goto("/admin#maintenance");
  await expect(
    portalPage.getByRole("heading", { exact: true, name: "Maintenance" })
  ).toBeVisible();
  await portalPage.close();
  await page.screenshot({
    fullPage: true,
    path: "test-results/property-workspace.png",
  });
  await page.setViewportSize({ height: 844, width: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
