import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
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
const sql = neon(process.env.DATABASE_URL!);
test.afterAll(async () => {
  await sql`DELETE FROM maintenance_requests WHERE property_id=${propertyId}`;
  await sql`DELETE FROM resident_links WHERE property_id=${propertyId}`;
  await sql`DELETE FROM rental_applications WHERE property_id=${propertyId}`;
  await sql`DELETE FROM rental_invoices WHERE property_id=${propertyId}`;
  await sql`DELETE FROM lease_drafts WHERE property_id=${propertyId}`;
  await sql`DELETE FROM lease_templates WHERE id=${templateId}`;
  await sql`DELETE FROM management_events WHERE entity_id IN (${propertyId},${applicationId},${invoiceId},${canceledInvoiceId},${linkId || propertyId},${draftId || propertyId})`;
  await sql`DELETE FROM management_events WHERE entity_id=${duplicatePropertyId}`;
  await sql`DELETE FROM properties WHERE id IN (${propertyId},${duplicatePropertyId})`;
});
test("property lifecycle, private records, public applications, resident links, drafts and signed payments", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  expect(
    (await request.post("/api/admin/billing", { data: {} })).status(),
  ).toBe(401);
  expect((await request.get("/api/admin/management")).status()).toBe(401);
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
  const send = (data: unknown) =>
    page.request.post("/api/admin/management", {
      headers: { origin, "x-vercel-forwarded-for": propertyId },
      data,
    });
  expect(
    (
      await page.request.post("/api/admin/management", {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/admin/billing", {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/admin/billing", {
        headers: { origin },
        data: {
          action: "create",
          id: crypto.randomUUID(),
          data: { authorized: false },
        },
      })
    ).status(),
  ).toBe(400);
  const property = {
    name: "Test property",
    slug,
    address: `1 Test St, Unit ${propertyId.slice(0, 8)}`,
    description: "A test listing",
    rentCents: 250000,
    bedrooms: 3,
    bathrooms: 2,
    availableDate: "2026-11-01",
    contact: "owner@example.invalid",
    emergencyContact: "Contact owner directly",
    criteria: "Test criteria version 1",
    criteriaVersion: "TEST-1",
    published: false,
    acceptingApplications: false,
  };
  expect(
    (
      await send({
        action: "property",
        id: propertyId,
        revision: 0,
        data: property,
      })
    ).ok(),
  ).toBe(true);
  expect((await request.get(`/properties/${slug}`)).status()).toBe(404);
  expect(
    (
      await send({
        action: "property",
        id: propertyId,
        revision: 1,
        data: { ...property, published: true, acceptingApplications: true },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await send({
        action: "property",
        id: propertyId,
        revision: 1,
        data: property,
      })
    ).status(),
  ).toBe(409);
  await page.goto(`/properties/${slug}/apply`);
  await expect(
    page.getByRole("heading", { name: "Selection criteria" }),
  ).toBeVisible();
  const data = {
    name: "Fixture applicant",
    email: "fixture@example.invalid",
    phone: "555-0100",
    currentAddress: "2 Test St",
    monthlyIncome: 8000,
    incomeDetails: "Fixture income",
    housingHistory: "Fixture history",
    moveDate: "2026-11-01",
    occupants: 2,
    notes: "",
    acknowledgment: true,
    accuracy: true,
  };
  const apply = (revision: number) =>
    request.post("/api/applications", {
      headers: { origin, "x-vercel-forwarded-for": propertyId },
      data: { id: applicationId, propertyId, revision, website: "", data },
    });
  expect((await apply(1)).status()).toBe(409);
  expect((await apply(2)).status()).toBe(201);
  expect((await apply(2)).status()).toBe(201);
  const rows =
    await sql`SELECT * FROM rental_applications WHERE id=${applicationId}`;
  expect(rows).toHaveLength(1);
  expect(rows[0].criteria_snapshot).toBe(property.criteria);
  expect((await request.get("/api/admin/management")).status()).toBe(401);
  expect(
    (
      await send({
        action: "residentLink",
        propertyId,
        residentName: "Fixture resident",
      })
    ).ok(),
  ).toBe(true);
  let records = await (await page.request.get("/api/admin/management")).json();
  const link = records.residentLinks.find(
    (l: { propertyId: string }) => l.propertyId === propertyId,
  );
  linkId = link.id;
  const residentToken = link.url.split("/").pop();
  const maintenance = {
    id: crypto.randomUUID(),
    token: residentToken,
    website: "",
    data: {
      name: "Fixture resident",
      email: "fixture@example.invalid",
      phone: "555-0100",
      subject: "Fixture repair",
      description: "Test only",
      priority: "routine",
      accessNotes: "Call first",
    },
  };
  expect(
    (
      await request.post("/api/maintenance", {
        headers: { origin, "x-vercel-forwarded-for": propertyId },
        data: { ...maintenance, token: residentToken + "x" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post("/api/maintenance", {
        headers: { origin, "x-vercel-forwarded-for": propertyId },
        data: maintenance,
      })
    ).status(),
  ).toBe(201);
  await send({ action: "revokeLink", id: link.id });
  expect(
    (
      await request.post("/api/maintenance", {
        headers: { origin, "x-vercel-forwarded-for": propertyId },
        data: maintenance,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await send({
        action: "leaseTemplate",
        id: templateId,
        name: "Fixture template",
        body: "Lease for {{tenant_names}} at {{property_address}}.",
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Leases", exact: true }).click();
  await page
    .getByLabel("Lease property", { exact: true })
    .selectOption(propertyId);
  await page
    .getByLabel("Lease template", { exact: true })
    .selectOption(templateId);
  await page.getByLabel("Landlord legal name").fill("Fixture owner");
  await page.getByLabel("Tenant legal names").fill("Fixture tenant");
  await page.getByLabel("Lease start date").fill("2026-11-01");
  await page.getByLabel("Lease end date").fill("2027-10-31");
  await page.getByLabel("Security deposit (formatted amount)").fill("$2,500");
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(page.getByLabel("Draft text", { exact: true })).toHaveValue(
    `Lease for Fixture tenant at ${property.address}.`,
  );
  await page.getByRole("button", { name: "Save new draft version" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  records = await (await page.request.get("/api/admin/management")).json();
  draftId = records.drafts.find(
    (d: { propertyId: string }) => d.propertyId === propertyId,
  ).id;
  expect(
    (
      await send({
        action: "invoice",
        id: invoiceId,
        data: {
          propertyId,
          payerName: "Fixture tenant",
          payerEmail: "fixture@example.invalid",
          category: "rent",
          description: "Test rent",
          amountCents: 250000,
          dueDate: "2026-11-01",
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await send({
        action: "invoice",
        id: canceledInvoiceId,
        data: {
          propertyId,
          payerName: "Fixture",
          payerEmail: "fixture@example.invalid",
          category: "rent",
          description: "Canceled fixture",
          amountCents: 1000,
          dueDate: "2026-11-01",
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await send({ action: "voidInvoice", id: canceledInvoiceId })).ok(),
  ).toBe(true);
  records = await (await page.request.get("/api/admin/management")).json();
  const canceled = records.invoices.find(
    (i: { id: string }) => i.id === canceledInvoiceId,
  );
  expect(
    (
      await request.post("/api/payments/checkout", {
        headers: { origin },
        data: { token: canceled.url.split("/").pop() },
      })
    ).status(),
  ).toBe(410);
  expect(
    (
      await request.post("/api/payments/webhook", {
        data: { type: "checkout.session.completed" },
      })
    ).status(),
  ).toBe(400);
  if (process.env.STRIPE_WEBHOOK_SECRET === "whsec_test_only") {
    const stripe = new Stripe("sk_test_fixture");
    const event = {
      id: "evt_fixture",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_fixture",
          object: "checkout.session",
          livemode: false,
          client_reference_id: invoiceId,
          metadata: { invoiceId },
          currency: "usd",
          amount_total: 250000,
          payment_status: "paid",
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_test_only",
    });
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request.post("/api/payments/webhook", {
            headers: {
              "stripe-signature": signature,
              "Content-Type": "application/json",
            },
            data: payload,
          })
        ).status(),
      ).toBe(200);
    const paid =
      await sql`SELECT status FROM rental_invoices WHERE id=${invoiceId}`;
    expect(paid[0].status).toBe("paid");
  }
  const { slug: ignoredSlug, ...automaticProperty } = property;
  expect(
    (
      await send({
        action: "property",
        id: duplicatePropertyId,
        revision: 0,
        data: automaticProperty,
      })
    ).ok(),
  ).toBe(true);
  let listingRecords = await (
    await page.request.get("/api/admin/management")
  ).json();
  const duplicate = listingRecords.properties.find(
    (p: { id: string }) => p.id === duplicatePropertyId,
  );
  expect(duplicate.slug).toBe(
    `${slug}-${duplicatePropertyId.replaceAll("-", "")}`,
  );
  expect(
    (
      await send({
        action: "property",
        id: propertyId,
        revision: 2,
        data: {
          ...automaticProperty,
          address: "Corrected address",
          published: true,
        },
      })
    ).ok(),
  ).toBe(true);
  listingRecords = await (
    await page.request.get("/api/admin/management")
  ).json();
  expect(
    listingRecords.properties.find((p: { id: string }) => p.id === propertyId)
      .slug,
  ).toBe(slug);
  expect((await request.get(`/properties/${slug}`)).ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByRole("button", { name: "Add property", exact: true }).click();
  await expect(
    page.getByLabel("Listing URL name", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Your listing link is generated automatically from the property address when you save.",
    ),
  ).toBeVisible();

  await page.screenshot({
    path: "test-results/property-workspace.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
