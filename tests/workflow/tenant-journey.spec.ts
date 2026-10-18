// biome-ignore-all lint/performance/noAwaitInLoops: Each signing and account transition depends on the preceding response.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { requireValue } from "@/lib/required";

const origin = "http://localhost:3193";
const service = "http://localhost:3194";
const email = requireValue(
  process.env.TENANT_TEST_EMAIL,
  "Use npm run test:tenant:workflow"
);
const ownerEmail = "owner@example.invalid";
const fullName = "Test Tenant";
const body =
  "TEST ONLY — NOT A REAL CONTRACT. Synthetic tenant walkthrough. No tenancy or financial obligations are created.";
const signingLink = /\/sign\/lease\/([a-f0-9]{64})/;
const emailCode = /verification code is (\d{6})/;
const signInPath = /\/sign-in/;

type Row = Record<string, string>;
interface Message {
  text: string;
  to: string[];
}
async function control(
  request: APIRequestContext,
  path: string,
  data?: unknown
) {
  const response = await request.post(service + path, {
    data,
    headers: { authorization: `Bearer ${process.env.TENANT_TEST_CONTROL}` },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function sql(
  request: APIRequestContext,
  query: string,
  params: unknown[] = []
): Promise<Row[]> {
  return (await control(request, "/database", { params, query })).rows;
}
async function post(
  request: APIRequestContext,
  path: string,
  data: unknown,
  status = 200
) {
  const result = await request.post(origin + path, {
    data,
    headers: { origin },
  });
  expect(result.status(), await result.text()).toBe(status);
  return result.json();
}
async function message(
  request: APIRequestContext,
  recipient: string,
  pattern: RegExp
) {
  const { mail }: { mail: Message[] } = await control(request, "/state");
  const found = mail.findLast(
    (item) => item.to.includes(recipient) && pattern.test(item.text)
  );
  return requireValue(
    requireValue(found, "Expected captured test email").text.match(pattern),
    "Expected email value"
  )[1];
}
async function sign(
  page: Page,
  request: APIRequestContext,
  token: string,
  name: string,
  recipient: string
) {
  await page.bringToFront();
  const endpoint = `/api/lease-signing/${token}`;
  await page.goto(`/sign/lease/${token}`);
  await expect(
    page.getByText("Need paper instead?", { exact: false })
  ).toContainText("Test Owner (owner@example.invalid)");
  await post(request, endpoint, { action: "code" });
  const code = await message(request, recipient, emailCode);
  await page.getByLabel("Six-digit email code").fill(code);
  await page
    .getByRole("button", { exact: true, name: "Verify and review lease" })
    .click();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { exact: true, name: "Download lease PDF" })
    .click();
  await (await download).saveAs(
    test
      .info()
      .outputPath(`unsigned-${recipient === email ? "tenant" : "owner"}.pdf`)
  );
  await page.getByLabel("Confirm your full legal name").fill(name);
  const canvas = page.getByLabel("Draw your signature");
  await canvas.scrollIntoViewIfNeeded();
  const rect = requireValue(
    await canvas.boundingBox(),
    "Signature canvas must be visible"
  );
  await page.mouse.move(rect.x + 20, rect.y + 60);
  await page.mouse.down();
  for (let x = 30; x <= 230; x += 8) {
    await page.mouse.move(rect.x + x, rect.y + 60 + Math.sin(x / 20) * 20);
  }
  await page.mouse.up();
  const submit = page.getByRole("button", {
    exact: true,
    name: "Sign this lease",
  });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox").check();
  await submit.click();
  await expect(page.getByRole("status")).toContainText(
    "Your signature was recorded"
  );
}

test.beforeAll(async () => {
  expect(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")).toBe(true);
  expect(process.env.PAYMENTS_LIVE_ENABLED).toBe("false");
  await clerkSetup();
});

test("tenant lifecycle: account, assigned access, signed lease PDF, payment, ACH, history, maintenance, settings and revocation", async ({
  browser,
  page,
  request,
}) => {
  const propertyId = crypto.randomUUID(),
    templateId = crypto.randomUUID(),
    draftId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID(),
    hiddenInvoiceId = crypto.randomUUID(),
    scheduleId = crypto.randomUUID();
  const errors: string[] = [];
  page.on("console", (entry) => {
    if (
      entry.type() === "error" &&
      entry.text().includes("violates the following Content Security Policy")
    ) {
      errors.push(entry.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const owner = await browser.newContext({ baseURL: origin });
  const ownerPage = await owner.newPage();
  const token = await encode({
    maxAge: 3600,
    secret: requireValue(
      process.env.NEXTAUTH_SECRET,
      "Expected isolated secret"
    ),
    token: { email: ownerEmail, googleVerified: true, sub: "isolated-owner" },
  });
  await owner.addCookies([
    {
      httpOnly: true,
      name: "next-auth.session-token",
      sameSite: "Lax",
      url: origin,
      value: token,
    },
  ]);
  const ownerPost = (path: string, payload: unknown, status = 200) =>
    post(owner.request, path, payload, status);
  const data = {
    acceptingApplications: true,
    address: "1 Demo Lane, Amarillo TX — TEST ONLY",
    availableDate: "2099-01-01",
    bathrooms: 1,
    bedrooms: 2,
    contact: ownerEmail,
    description: body,
    name: "TEST ONLY · Tenant walkthrough",
    published: false,
    rentCents: 250_000,
  };
  let enrollment = "",
    payment = "",
    accessId = "";
  try {
    await test.step("Real Clerk development sign-in; unassigned tenant cannot access owner tools", async () => {
      await setupClerkTestingToken({ page });
      await page.goto("/sign-in");
      await clerk.signIn({
        page,
        signInParams: { identifier: email, strategy: "email_code" },
      });
      // This development Clerk instance requires an organization. Use only the synthetic household.
      const household = page.getByText("Back Acres TEST household", {
        exact: true,
      });
      if (await household.isVisible()) {
        await household.click();
      }
      await page.goto("/tenant");
      await expect(
        page.getByRole("heading", { name: "Your account is ready" })
      ).toBeVisible();
      expect((await page.request.get("/api/admin/management")).status()).toBe(
        401
      );
      await expect(
        page.getByText("Payment history", { exact: true })
      ).toHaveCount(0);
    });
    await test.step("Owner prepares synthetic tenancy, invoice and finite ACH schedule through real APIs", async () => {
      await ownerPost("/api/admin/management", {
        action: "property",
        data,
        id: propertyId,
        revision: 0,
      });
      // Only the lease document is seeded directly; packet generation, delivery, verification and signing use app handlers.
      await sql(
        request,
        "INSERT INTO lease_templates(id,name,body) VALUES($1,$2,$3)",
        [templateId, "TEST ONLY lease", body]
      );
      await sql(
        request,
        "INSERT INTO lease_drafts(id,property_id,template_id,tenant_name,body) VALUES($1,$2,$3,$4,$5)",
        [draftId, propertyId, templateId, fullName, body]
      );
      for (const id of [invoiceId, hiddenInvoiceId]) {
        await ownerPost("/api/admin/management", {
          action: "invoice",
          data: {
            amountCents: 250_000,
            category: "rent",
            description:
              id === invoiceId
                ? "TEST ONLY first rent"
                : "PRIVATE other household invoice",
            dueDate: "2099-01-01",
            payerEmail: email,
            payerName: fullName,
            propertyId,
          },
          id,
        });
      }
      await ownerPost("/api/admin/billing", {
        action: "create",
        data: {
          authorized: true,
          collection: "ach",
          firstDate: "2099-01-10",
          installments: 2,
          monthlyCents: 250_000,
          payerEmail: email,
          payerName: fullName,
          propertyId,
        },
        id: scheduleId,
      });
      const records = await (
        await owner.request.get(`${origin}/api/admin/management`)
      ).json();
      enrollment = new URL(
        records.rentSchedules.find(
          (row: { id: string }) => row.id === scheduleId
        ).enrollmentUrl
      ).pathname;
      payment = new URL(
        records.invoices.find((row: { id: string }) => row.id === invoiceId).url
      ).pathname;
      await ownerPost("/api/admin/tenants", {
        action: "assign",
        data: {
          email,
          invoiceIds: [invoiceId],
          name: fullName,
          propertyId,
          scheduleIds: [scheduleId],
        },
      });
      const [access] = await sql(
        request,
        "SELECT id FROM tenant_access WHERE property_id=$1",
        [propertyId]
      );
      accessId = access.id;
      await page.reload();
      await expect(
        page.getByRole("heading", { name: data.name })
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { exact: true, name: "TEST ONLY first rent" })
      ).toBeVisible();
      await expect(
        page.getByText("PRIVATE other household invoice")
      ).toHaveCount(0);
    });
    await test.step("Captured invitations, mailbox verification, drawn signatures and immutable completed PDF", async () => {
      const created = await ownerPost(
        "/api/admin/lease-signing",
        {
          action: "create",
          data: {
            draftId,
            reviewed: true,
            signers: [
              { email, name: fullName, role: "tenant" },
              { email: ownerEmail, name: "Test Owner", role: "landlord" },
            ],
          },
        },
        201
      );
      const signers = await sql(
        request,
        "SELECT id,email,name FROM lease_signers WHERE packet_id=$1 ORDER BY role DESC",
        [created.id]
      );
      let tenantLink = "";
      for (const signer of signers) {
        await ownerPost("/api/admin/lease-signing", {
          action: "invite",
          signerId: signer.id,
        });
        const link = await message(request, signer.email, signingLink);
        if (signer.email === email) {
          tenantLink = `/sign/lease/${link}`;
        }
        await sign(
          signer.email === email ? page : ownerPage,
          request,
          link,
          signer.name,
          signer.email
        );
      }
      const [packet] = await sql(
        request,
        "SELECT status,document_hash,base_pdf,final_hash,final_pdf FROM lease_packets WHERE id=$1",
        [created.id]
      );
      expect(packet.status).toBe("completed");
      const pdf = Buffer.from(packet.final_pdf, "base64");
      expect(createHash("sha256").update(pdf).digest("hex")).toBe(
        packet.final_hash
      );
      expect(
        createHash("sha256")
          .update(Buffer.from(packet.base_pdf, "base64"))
          .digest("hex")
      ).toBe(packet.document_hash);
      const document = await PDFDocument.load(pdf);
      expect(document.getPageCount()).toBeGreaterThan(1);
      const imageCount = document
        .getPages()
        .reduce(
          (total, sheet) =>
            total +
            (sheet.node
              .Resources()
              ?.lookupMaybe(PDFName.of("XObject"), PDFDict)
              ?.keys().length ?? 0),
          0
        );
      expect(imageCount).toBeGreaterThanOrEqual(2);
      const evidence = await sql(
        request,
        "SELECT signed_at,evidence,signature_png FROM lease_signers WHERE packet_id=$1",
        [created.id]
      );
      expect(evidence).toHaveLength(2);
      for (const signer of evidence) {
        expect(signer.signed_at).toBeTruthy();
        expect(signer.signature_png.length).toBeGreaterThan(100);
        expect(JSON.parse(signer.evidence).documentHash).toBe(
          packet.document_hash
        );
      }
      const response = await owner.request.get(
        `${origin}/api/admin/leases/${draftId}/pdf`
      );
      expect(response.ok()).toBe(true);
      expect(
        createHash("sha256")
          .update(await response.body())
          .digest("hex")
      ).toBe(packet.final_hash);
      await writeFile(
        test.info().outputPath("completed-signed-test-lease.pdf"),
        pdf
      );
      await writeFile("output/test-tenant-signed-lease.pdf", pdf);
      await test.info().attach("Completed synthetic signed lease", {
        body: pdf,
        contentType: "application/pdf",
      });
      await writeFile(
        "output/tenant-workflow-links.json",
        JSON.stringify(
          {
            email,
            enrollment: origin + enrollment,
            lease: origin + tenantLink,
            payment: origin + payment,
            tenant: `${origin}/tenant`,
          },
          null,
          2
        )
      );
    });
    await test.step("Checkout submission stays processing until a signed settlement event; duplicate events stay idempotent", async () => {
      await page.goto(payment);
      await page
        .getByRole("button", { exact: true, name: "Pay securely with Stripe" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Simulated Stripe payment" })
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Complete simulated payment" })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Payment is not confirmed"
      );
      const [invoice] = await sql(
        request,
        "SELECT status,stripe_session_id FROM rental_invoices WHERE id=$1",
        [invoiceId]
      );
      expect(invoice.status).toBe("processing");
      const invalid = await request.post(`${origin}/api/payments/webhook`, {
        data: { type: "checkout.session.async_payment_succeeded" },
      });
      expect(invalid.status()).toBe(400);
      await control(request, `/settle/${invoice.stripe_session_id}`);
      await page.reload();
      await expect(page.getByRole("status")).toContainText("Payment received");
      expect(
        await sql(
          request,
          "SELECT * FROM payment_history WHERE invoice_id=$1 AND status='paid'",
          [invoiceId]
        )
      ).toHaveLength(1);
    });
    await test.step("Consent gates bank setup; verified mandate schedules finite ACH; accepted authorization can be saved", async () => {
      await page.goto(enrollment);
      await page
        .getByRole("button", { name: "Continue to secure bank authorization" })
        .click();
      await expect(page).toHaveURL(origin + enrollment);
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Continue to secure bank authorization" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Simulated Stripe bank setup" })
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Complete simulated bank verification" })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Your bank account is authorized"
      );
      const [schedule] = await sql(
        request,
        "SELECT status,authorization_text,consented_at,stripe_schedule_id FROM rent_schedules WHERE id=$1",
        [scheduleId]
      );
      expect(schedule.status).toBe("not_started");
      expect(schedule.consented_at).toBeTruthy();
      expect(schedule.stripe_schedule_id).toBeTruthy();
      const downloadButton = page.getByRole("button", {
        name: "Download authorization copy",
      });
      // This route has no Clerk polling; wait for client bundles before using the client-only download.
      await page.waitForLoadState("networkidle");
      const download = page.waitForEvent("download");
      await downloadButton.click();
      const path = test.info().outputPath("accepted-authorization.txt");
      await (await download).saveAs(path);
      expect(await readFile(path, "utf8")).toContain(
        schedule.authorization_text
      );
    });
    await test.step("Tenant sees only shared history and submits maintenance; owner sees the request", async () => {
      await page.goto("/tenant");
      const row = page
        .getByRole("row")
        .filter({ hasText: "TEST ONLY first rent" });
      await expect(row).toContainText("paid");
      await expect(
        page.getByText("PRIVATE other household invoice")
      ).toHaveCount(0);
      await page.getByText("New maintenance request", { exact: true }).click();
      await page
        .getByLabel("Subject", { exact: true })
        .fill("TEST ONLY dripping kitchen faucet");
      await page
        .getByLabel("What needs repair?")
        .fill("Synthetic maintenance request. Do not dispatch anyone.");
      await page.getByLabel("Contact phone").fill("555-0100");
      await page
        .getByLabel("Entry instructions")
        .fill("TEST ONLY — no property visit.");
      await page
        .getByRole("button", { name: "Submit maintenance request" })
        .click();
      await expect(page.getByRole("status")).toContainText("Request received");
      await page.reload();
      await expect(
        page.getByText("TEST ONLY dripping kitchen faucet", { exact: true })
      ).toBeVisible();
      await ownerPage.goto("/admin#maintenance");
      await expect(
        ownerPage
          .locator("summary")
          .filter({ hasText: "TEST ONLY dripping kitchen faucet" })
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: "output/tenant-workflow-overview.png",
      });
    });
    await test.step("Contact settings persist; tenant cannot edit another tenancy or use owner-only APIs", async () => {
      await page
        .getByRole("link", { exact: true, name: "Account settings" })
        .click();
      await page.getByLabel("Contact phone", { exact: true }).fill("555-0199");
      await page.getByRole("button", { name: "Save contact phone" }).click();
      await expect(page.getByRole("status")).toContainText(
        "Contact phone saved"
      );
      await page.reload();
      await expect(
        page.getByLabel("Contact phone", { exact: true })
      ).toHaveValue("555-0199");
      const forbidden = await page.request.post(`${origin}/api/tenant`, {
        data: { action: "settings", id: crypto.randomUUID(), phone: "555" },
        headers: { origin },
      });
      expect(forbidden.status()).toBe(404);
      expect(
        (await page.request.get(`${origin}/api/admin/tenants`)).status()
      ).toBe(401);
    });
    await test.step("Stop future ACH, revoke tenant access, restore demo access, and verify sign-out protection", async () => {
      await page.goto(enrollment);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Stop future automatic payments" })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Future automatic payments have stopped"
      );
      const [schedule] = await sql(
        request,
        "SELECT status FROM rent_schedules WHERE id=$1",
        [scheduleId]
      );
      expect(schedule.status).toBe("canceled");
      await ownerPost("/api/admin/tenants", { action: "revoke", id: accessId });
      await page.goto("/tenant");
      await expect(
        page.getByRole("heading", { name: "Your account is ready" })
      ).toBeVisible();
      await expect(page.getByText("TEST ONLY first rent")).toHaveCount(0);
      const revoked = await page.request.post(`${origin}/api/tenant`, {
        data: { action: "settings", id: accessId, phone: "555" },
        headers: { origin },
      });
      expect(revoked.status()).toBe(404);
      await ownerPost("/api/admin/tenants", {
        action: "assign",
        data: {
          email,
          invoiceIds: [invoiceId],
          name: fullName,
          propertyId,
          scheduleIds: [scheduleId],
        },
      });
      await clerk.signOut({ page });
      await page.goto("/tenant");
      await expect(page).toHaveURL(signInPath);
      expect(
        (
          await page.request.post(`${origin}/api/tenant`, {
            data: { action: "settings", id: accessId, phone: "555" },
            headers: { origin },
          })
        ).status()
      ).toBe(401);
    });
    await test.step("Leave a fresh synthetic lease, invoice and ACH link for the manual walkthrough", async () => {
      const freshDraft = crypto.randomUUID(),
        freshInvoice = crypto.randomUUID(),
        freshSchedule = crypto.randomUUID();
      await sql(
        request,
        "INSERT INTO lease_drafts(id,property_id,template_id,tenant_name,body) VALUES($1,$2,$3,$4,$5)",
        [freshDraft, propertyId, templateId, fullName, body]
      );
      const freshPacket = await ownerPost(
        "/api/admin/lease-signing",
        {
          action: "create",
          data: {
            draftId: freshDraft,
            reviewed: true,
            signers: [
              { email, name: fullName, role: "tenant" },
              { email: ownerEmail, name: "Test Owner", role: "landlord" },
            ],
          },
        },
        201
      );
      const freshSigners = await sql(
        request,
        "SELECT id,email FROM lease_signers WHERE packet_id=$1",
        [freshPacket.id]
      );
      for (const signer of freshSigners) {
        await ownerPost("/api/admin/lease-signing", {
          action: "invite",
          signerId: signer.id,
        });
      }
      const link = await message(request, email, signingLink);
      await ownerPost("/api/admin/management", {
        action: "invoice",
        data: {
          amountCents: 250_000,
          category: "rent",
          description: "TEST ONLY manual walkthrough rent",
          dueDate: "2099-02-01",
          payerEmail: email,
          payerName: fullName,
          propertyId,
        },
        id: freshInvoice,
      });
      await ownerPost("/api/admin/billing", {
        action: "create",
        data: {
          authorized: true,
          collection: "ach",
          firstDate: "2099-02-10",
          installments: 2,
          monthlyCents: 250_000,
          payerEmail: email,
          payerName: fullName,
          propertyId,
        },
        id: freshSchedule,
      });
      await ownerPost("/api/admin/tenants", {
        action: "assign",
        data: {
          email,
          invoiceIds: [invoiceId, freshInvoice],
          name: fullName,
          propertyId,
          scheduleIds: [scheduleId, freshSchedule],
        },
      });
      const records = await (
        await owner.request.get(`${origin}/api/admin/management`)
      ).json();
      const links = {
        email,
        enrollment: records.rentSchedules.find(
          (item: { id: string }) => item.id === freshSchedule
        ).enrollmentUrl,
        lease: `${origin}/sign/lease/${link}`,
        payment: records.invoices.find(
          (item: { id: string }) => item.id === freshInvoice
        ).url,
        tenant: `${origin}/tenant`,
      };
      await writeFile(
        "output/tenant-workflow-links.json",
        JSON.stringify(links, null, 2)
      );
    });
    expect(errors).toEqual([]);
  } finally {
    await owner.close();
  }
});
