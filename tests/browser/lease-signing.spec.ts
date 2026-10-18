import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import sharp from "sharp";
import {
  digest,
  codeDigest,
  SIGNING_CONSENT_VERSION,
} from "../../lib/leases/signing-model";
loadEnvConfig(process.cwd());
const sql = neon(process.env.DATABASE_URL!),
  origin = "http://localhost:3191",
  propertyId = crypto.randomUUID(),
  templateId = crypto.randomUUID(),
  draftId = crypto.randomUUID(),
  childId = crypto.randomUUID();
const brandName = `SIGNATURE BRAND TEST ${propertyId}`;
const body =
  "TEST ONLY - NOT A REAL CONTRACT\nResidential lease signature workflow fixture.\nNo tenancy or payment obligations are created by this test.";
test.afterAll(async () => {
  await sql`DELETE FROM lease_signers WHERE packet_id IN(SELECT id FROM lease_packets WHERE draft_id IN(SELECT id FROM lease_drafts WHERE property_id=${propertyId}))`;
  await sql`DELETE FROM lease_packets WHERE draft_id IN(SELECT id FROM lease_drafts WHERE property_id=${propertyId})`;
  await sql`DELETE FROM removed_records WHERE entity_id IN(${propertyId},${draftId},${childId})`;
  await sql`DELETE FROM brand_versions WHERE name=${brandName}`;
  await sql`DELETE FROM lease_drafts WHERE property_id=${propertyId}`;
  await sql`DELETE FROM lease_templates WHERE id=${templateId}`;
  await sql`DELETE FROM properties WHERE id=${propertyId}`;
});
test("frozen lease, verified individual signatures, cancellation, durable audit and branded signed PDF", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180000);
  expect(
    (await request.get(`/api/admin/lease-signing?draftId=${draftId}`)).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/admin/branding", { data: {} })).status(),
  ).toBe(401);
  await sql`INSERT INTO properties(id,slug,data)VALUES(${propertyId},${"signing-test-" + propertyId},${JSON.stringify({ name: "SIGNATURE TEST ONLY", address: "Test premises - not an offer", rentCents: 100, published: false, contact: "test@example.invalid" })}::jsonb)`;
  await sql`INSERT INTO lease_templates(id,name,body)VALUES(${templateId},'SIGNING TEST ONLY',${body})`;
  await sql`INSERT INTO lease_drafts(id,property_id,template_id,tenant_name,body)VALUES(${draftId},${propertyId},${templateId},'Test Tenant',${body})`;
  await sql`INSERT INTO lease_drafts(id,property_id,template_id,parent_id,tenant_name,body)VALUES(${childId},${propertyId},${templateId},${draftId},'Test Tenant',${body + "\nReplacement fixture."})`;
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      googleVerified: true,
      sub: "signature-test",
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
  let brandVersion = "";
  if (process.env.LEASE_SIGNING_TEST_BRANDING === "1") {
    const [existing] =
      await sql`SELECT count(*)::int as total FROM brand_versions`;
    expect(
      existing.total,
      "Branding integration requires an empty test branding table.",
    ).toBe(0);
    await page.goto("/admin#branding");
    await page.getByLabel("Business name").fill(brandName);
    await page.getByLabel("Upload logo").setInputFiles({
      name: "test-logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg width="160" height="70"><rect width="160" height="70" style="fill:#215132"/><path d="M20 50L45 15L70 50Z" fill="white"/></svg>',
      ),
    });
    await page
      .getByRole("button", { name: "Save branding", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Branding saved");
    const current = await (
      await page.request.get("/api/admin/branding")
    ).json();
    brandVersion = current.current.id;
    expect(
      (await page.request.get("/api/branding/logo")).headers()["content-type"],
    ).toBe("image/png");
    await page.screenshot({
      path: "test-results/lease-branding-admin.png",
      fullPage: false,
    });
  }
  const signers = [
    {
      name: "Test Tenant",
      email: `tenant-${propertyId}@example.invalid`,
      role: "tenant",
    },
    {
      name: "Test Owner",
      email: `owner-${propertyId}@example.invalid`,
      role: "landlord",
    },
  ];
  const create = (id: string) =>
    page.request.post("/api/admin/lease-signing", {
      headers: { origin },
      data: {
        action: "create",
        data: { draftId: id, reviewed: true, signers },
      },
    });
  expect(
    (
      await page.request.post("/api/admin/lease-signing", {
        headers: { origin: "https://example.invalid" },
        data: { action: "create", data: { draftId, reviewed: true, signers } },
      })
    ).status(),
  ).toBe(403);
  const created = await create(draftId);
  expect(created.status(), await created.text()).toBe(201);
  const packetId = (await created.json()).id;
  expect((await create(childId)).status()).toBe(409);
  const [packet] = await sql`SELECT * FROM lease_packets WHERE id=${packetId}`;
  expect(packet.document_hash).toBe(
    digest(Buffer.from(packet.base_pdf, "base64")),
  );
  if (brandVersion) {
    const branded = await PDFDocument.load(
      Buffer.from(packet.base_pdf, "base64"),
    );
    expect(
      branded
        .getPage(0)
        .node.Resources()!
        .lookup(PDFName.of("XObject"), PDFDict)
        .keys().length,
    ).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Remove logo", exact: true })
      .click();
    await expect(
      page.getByText("No logo uploaded yet.", { exact: true }),
    ).toBeVisible();
    const frozen = await page.request.get(`/api/admin/leases/${draftId}/pdf`);
    expect(digest(await frozen.body())).toBe(packet.document_hash);
    const restore = await page.request.post("/api/admin/branding", {
      multipart: { name: brandName, restore: brandVersion },
      headers: { origin },
    });
    expect(restore.status()).toBe(200);
    const restored = await (
      await page.request.get("/api/admin/branding")
    ).json();
    expect(restored.current.logoPng).toBeTruthy();
  }
  const rows =
    await sql`SELECT * FROM lease_signers WHERE packet_id=${packetId} ORDER BY role DESC`;
  const ink = await sharp(
      Buffer.from(
        '<svg width="300" height="100"><path d="M20 70 Q60 0 100 60T280 50" fill="none" stroke="black" stroke-width="4"/></svg>',
      ),
    )
      .png()
      .toBuffer(),
    signature = `data:image/png;base64,${ink.toString("base64")}`;
  for (const signer of rows) {
    let access = randomBytes(32).toString("hex"),
      code = "123456";
    if (process.env.LEASE_SIGNING_TEST_OUTBOX) {
      const messages = () =>
        readFileSync(process.env.LEASE_SIGNING_TEST_OUTBOX!, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { to: string[]; text: string });
      const invitation = await page.request.post("/api/admin/lease-signing", {
        headers: { origin },
        data: { action: "invite", signerId: signer.id },
      });
      expect(invitation.status()).toBe(200);
      const message = messages()
        .reverse()
        .find(
          (m) => m.to.includes(signer.email) && m.text.includes("/sign/lease/"),
        );
      access = message!.text.match(/\/sign\/lease\/([a-f0-9]{64})/)![1];
      const issued = await request.post(`/api/lease-signing/${access}`, {
        headers: { origin },
        data: { action: "code" },
      });
      expect(issued.status()).toBe(200);
      code = messages()
        .reverse()
        .find(
          (m) =>
            m.to.includes(signer.email) &&
            m.text.includes("verification code is"),
        )!
        .text.match(/\b(\d{6})\b/)![1];
    } else {
      // Ordinary regression runs seed mailbox verification; test:signing exercises delivery through an isolated mail transport.
      await sql`UPDATE lease_signers SET token_hash=${digest(access)},code_hash=${codeDigest(access, code)},code_expires_at=now()+interval '10 minutes',code_attempts=0 WHERE id=${signer.id}`;
    }
    const context = await browser.newContext({
        viewport:
          signer.role === "tenant"
            ? { width: 390, height: 844 }
            : { width: 1440, height: 900 },
      }),
      signPage = await context.newPage(),
      errors: string[] = [];
    signPage.on("pageerror", (e) => errors.push(e.message));
    const endpoint = `/api/lease-signing/${access}`;
    const hidden = await context.request.get(origin + endpoint);
    expect((await hidden.json()).body).toBeUndefined();
    expect(
      (await context.request.get(origin + endpoint + "?format=pdf")).status(),
    ).toBe(401);
    expect(
      (
        await context.request.post(origin + endpoint, {
          headers: { origin },
          data: {
            action: "sign",
            signature,
            consent: true,
            consentVersion: SIGNING_CONSENT_VERSION,
            documentHash: packet.document_hash,
            name: signer.name,
          },
        })
      ).status(),
    ).toBe(401);
    if (signer.role === "tenant") {
      for (let attempt = 0; attempt < 5; attempt++)
        expect(
          (
            await context.request.post(origin + endpoint, {
              headers: { origin },
              data: { action: "verify", code: "000000" },
            })
          ).status(),
        ).toBe(400);
      expect(
        (
          await context.request.post(origin + endpoint, {
            headers: { origin },
            data: { action: "verify", code },
          })
        ).status(),
      ).toBe(400);
      await sql`UPDATE lease_signers SET code_attempts=0 WHERE id=${signer.id}`;
    }
    await signPage.goto(`/sign/lease/${access}`);
    await signPage.getByLabel("Six-digit email code").fill(code);
    const verification = signPage.waitForResponse(
      (r) =>
        r.url().endsWith(endpoint) &&
        r.request().postDataJSON()?.action === "verify",
    );
    await signPage
      .getByRole("button", { name: "Verify and review lease", exact: true })
      .click();
    const verified = await (await verification).json(),
      authorization = `Bearer ${verified.session}`;
    await expect(signPage.getByText(body, { exact: true })).toBeVisible();
    const payload = {
      action: "sign",
      signature,
      consent: true,
      consentVersion: SIGNING_CONSENT_VERSION,
      documentHash: packet.document_hash,
      name: signer.name,
    };
    expect(
      (
        await context.request.post(origin + endpoint, {
          headers: { origin, authorization },
          data: payload,
        })
      ).status(),
    ).toBe(400);
    const download = signPage.waitForEvent("download");
    await signPage
      .getByRole("button", { name: "Download lease PDF", exact: true })
      .click();
    await (
      await download
    ).saveAs(`test-results/lease-signing-original-${signer.role}.pdf`);
    expect(
      (
        await context.request.post(origin + endpoint, {
          headers: { origin, authorization },
          data: { ...payload, documentHash: "0".repeat(64) },
        })
      ).status(),
    ).toBe(400);
    await signPage.getByLabel("Confirm your full legal name").fill(signer.name);
    await expect(signPage.locator(".signature-capture")).toBeEnabled();
    if (signer.role === "tenant") {
      const canvas = signPage.getByLabel("Draw your signature");
      await canvas.scrollIntoViewIfNeeded();
      const rect = await canvas.boundingBox();
      expect(rect).toBeTruthy();
      await signPage.mouse.move(rect!.x + 30, rect!.y + 80);
      await signPage.mouse.down();
      for (let x = 40; x <= 250; x += 10)
        await signPage.mouse.move(
          rect!.x + x,
          rect!.y + 55 + Math.sin(x / 25) * 25,
        );
      await signPage.mouse.up();
      await signPage.setViewportSize({ width: 600, height: 844 });
      await signPage.setViewportSize({ width: 390, height: 844 });
      await signPage.screenshot({
        path: "test-results/lease-signature-mobile.png",
        fullPage: false,
      });
    } else {
      await signPage
        .getByRole("button", { name: "Type signature", exact: true })
        .click();
      await signPage
        .getByLabel("Type your full name to adopt as your signature")
        .fill(signer.name);
    }
    await signPage.getByRole("checkbox").check();
    await expect(
      signPage.getByRole("button", { name: "Sign this lease", exact: true }),
    ).toBeEnabled();
    await signPage
      .getByRole("button", { name: "Sign this lease", exact: true })
      .click();
    await expect(signPage.getByRole("status")).toContainText(
      "Your signature was recorded",
    );
    expect(
      (
        await context.request.post(origin + endpoint, {
          headers: { origin, authorization },
          data: payload,
        })
      ).status(),
    ).toBe(409);
    expect(
      await signPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
    const inProgress = await page.request.get(
      `/api/admin/leases/${draftId}/pdf?preview=1`,
    );
    expect(inProgress.status()).toBe(200);
    expect(
      Number(inProgress.headers()["x-lease-signature-page"]),
    ).toBeGreaterThan(1);
    const progressPdf = await PDFDocument.load(await inProgress.body());
    expect(progressPdf.getPageCount()).toBeGreaterThan(1);
    const [unchanged] =
      await sql`SELECT document_hash,base_pdf FROM lease_packets WHERE id=${packetId}`;
    expect(unchanged.base_pdf).toBe(packet.base_pdf);
    expect(unchanged.document_hash).toBe(packet.document_hash);
    if (signer.role === "tenant") {
      expect(progressPdf.getTitle()).toContain("awaiting signatures");
      await page.goto("/admin#leases");
      const card = page.locator(".lease-saved .record").filter({
        has: page.getByRole("heading", { name: "Test Tenant", exact: true }),
      });
      await card
        .locator("summary")
        .filter({ hasText: "Earlier versions" })
        .click();
      const earlier = card.locator(".lease-history-row").first();
      await earlier
        .getByRole("button", { name: "Preview PDF", exact: true })
        .click();
      const viewer = earlier.getByRole("region", { name: "Lease PDF preview" });
      await expect(viewer.locator(".react-pdf__Page__canvas")).toBeVisible({
        timeout: 30000,
      });
      await viewer
        .getByRole("button", { name: "View signatures", exact: true })
        .click();
      await expect(
        viewer.locator(".react-pdf__Page__textContent"),
      ).toContainText("Awaiting signature");
      await expect(
        viewer.locator(".react-pdf__Page__textContent"),
      ).toContainText("Signed:");
      await viewer.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "test-results/lease-pdf-signature-preview.png",
      });
    }
  }
  const [completed] =
    await sql`SELECT * FROM lease_packets WHERE id=${packetId}`;
  expect(completed.status).toBe("completed");
  expect(completed.base_pdf).toBe(packet.base_pdf);
  expect(completed.final_hash).toBe(
    digest(Buffer.from(completed.final_pdf, "base64")),
  );
  const recorded =
    await sql`SELECT * FROM lease_signers WHERE packet_id=${packetId}`;
  for (const signer of recorded) {
    expect(signer.signed_at).toBeTruthy();
    expect(signer.signature_png.length).toBeGreaterThan(100);
    expect(signer.evidence_hash).toBe(digest(signer.evidence));
    expect(JSON.parse(signer.evidence).documentHash).toBe(packet.document_hash);
  }
  const exported = await page.request.get(`/api/admin/leases/${draftId}/pdf`);
  expect(exported.status()).toBe(200);
  const bytes = await exported.body(),
    pdf = await PDFDocument.load(bytes);
  expect(pdf.getTitle()).toContain("Signed residential lease");
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(digest(bytes)).toBe(completed.final_hash);
  await exported
    .body()
    .then((b) =>
      require("node:fs").writeFileSync(
        "test-results/lease-signature-complete.pdf",
        b,
      ),
    );
  expect(
    (
      await page.request.post("/api/admin/lease-signing", {
        headers: { origin },
        data: { action: "void", packetId },
      })
    ).status(),
  ).toBe(409);
  expect((await create(childId)).status()).toBe(201);
  const [pending] =
    await sql`SELECT id FROM lease_packets WHERE draft_id=${childId}`;
  const expiredToken = randomBytes(32).toString("hex");
  await sql`UPDATE lease_signers SET token_hash=${digest(expiredToken)} WHERE id=(SELECT id FROM lease_signers WHERE packet_id=${pending.id} LIMIT 1)`;
  await sql`UPDATE lease_packets SET expires_at=now()-interval '1 minute' WHERE id=${pending.id}`;
  expect(
    (await request.get(`/api/lease-signing/${expiredToken}`)).status(),
  ).toBe(404);
  await sql`UPDATE lease_packets SET expires_at=now()+interval '1 day' WHERE id=${pending.id}`;
  expect(
    (
      await page.request.post("/api/admin/lease-signing", {
        headers: { origin },
        data: { action: "void", packetId: pending.id },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await request.get(`/api/lease-signing/${expiredToken}`)).status(),
  ).toBe(404);
  expect(
    (await page.request.get(`/api/admin/leases/${draftId}/pdf`)).body(),
  ).toBeTruthy();
  await page.goto("/admin#branding");
  await expect(
    page.getByRole("heading", { name: "Branding", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Upload logo")).toHaveAttribute(
    "accept",
    "image/png,image/svg+xml,.png,.svg",
  );
});

test("visible send flow emails every signer, retains successes on partial failure, and previews the actual PDF", async ({
  page,
}) => {
  test.skip(
    !process.env.LEASE_SIGNING_TEST_OUTBOX,
    "Use test:signing for isolated email delivery.",
  );
  test.setTimeout(120000);
  const deliveryId = crypto.randomUUID(),
    tenant = `DELIVERY TEST ${propertyId}`,
    tenantEmail = `delivery-tenant-${propertyId}@example.invalid`,
    ownerEmail = `delivery-owner-${propertyId}@example.invalid`;
  await sql`INSERT INTO properties(id,slug,data)VALUES(${propertyId},${"signing-test-" + propertyId},${JSON.stringify({ name: "SIGNATURE TEST ONLY", address: "Test premises - not an offer", rentCents: 100, published: false, contact: "test@example.invalid" })}::jsonb) ON CONFLICT(id) DO NOTHING`;
  await sql`INSERT INTO lease_templates(id,name,body)VALUES(${templateId},'SIGNING TEST ONLY',${body}) ON CONFLICT(id) DO NOTHING`;
  await sql`INSERT INTO lease_drafts(id,property_id,template_id,tenant_name,body,"values")VALUES(${deliveryId},${propertyId},${templateId},${tenant},${body},${JSON.stringify({ landlord_name: "Delivery Owner", landlord_email: ownerEmail })}::jsonb)`;
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      email: process.env.ADMIN_EMAILS!.split(",")[0],
      googleVerified: true,
      sub: "lease-delivery-test",
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
  await page.emulateMedia({ colorScheme: "dark" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin#leases");
  const card = page
    .locator(".lease-saved .record")
    .filter({ has: page.getByRole("heading", { name: tenant, exact: true }) });
  await card.getByRole("button", { name: "Preview PDF", exact: true }).click();
  const viewer = card.getByRole("region", { name: "Lease PDF preview" });
  await expect(viewer.locator(".react-pdf__Page__canvas")).toBeVisible({
    timeout: 30000,
  });
  await expect(viewer.locator(".react-pdf__Page__textContent")).toContainText(
    "TEST ONLY",
  );
  await expect(
    viewer.getByRole("button", { name: "View signatures", exact: true }),
  ).toHaveCount(0);
  await viewer
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await card.getByRole("button", { name: "Send lease", exact: true }).click();
  const panel = card.getByRole("region", {
    name: `Send lease to ${tenant}`,
    exact: true,
  });
  await panel
    .getByLabel("Email address", { exact: true })
    .first()
    .fill(tenantEmail);
  await expect(
    panel.getByLabel("Email address", { exact: true }).nth(1),
  ).toHaveValue(ownerEmail);
  await panel.getByRole("checkbox").check();
  let rejected = false;
  await page.route("**/api/admin/lease-signing", async (route) => {
    const data = route.request().postDataJSON();
    if (
      !rejected &&
      route.request().method() === "POST" &&
      data?.action === "invite"
    ) {
      rejected = true;
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Isolated test email rejection." }),
      });
    } else await route.continue();
  });
  await panel
    .getByRole("button", { name: "Send lease for signature", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "Some emails could not be sent",
    { timeout: 30000 },
  );
  const [pending] =
    await sql`SELECT id,base_pdf,document_hash FROM lease_packets WHERE draft_id=${deliveryId}`;
  const states =
    await sql`SELECT email,invited_at FROM lease_signers WHERE packet_id=${pending.id}`;
  expect(states.filter((s) => s.invited_at)).toHaveLength(1);
  await page.reload();
  await card.getByRole("button", { name: "Send lease", exact: true }).click();
  await panel
    .getByRole("button", { name: "Send unsent emails", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "1 signing email accepted",
    { timeout: 30000 },
  );
  await expect(
    panel.getByText("No email send recorded", { exact: true }),
  ).toHaveCount(0);
  const messages = readFileSync(process.env.LEASE_SIGNING_TEST_OUTBOX!, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((v) => JSON.parse(v));
  expect(messages.filter((m) => m.to.includes(ownerEmail))).toHaveLength(1);
  expect(messages.filter((m) => m.to.includes(tenantEmail))).toHaveLength(1);
  expect(
    messages
      .filter((m) => m.to.includes(ownerEmail) || m.to.includes(tenantEmail))
      .every((m) => m.to.length === 1),
  ).toBe(true);
  await card.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect(viewer.locator(".react-pdf__Page__canvas")).toBeVisible();
  const frozen = await page.request.get(
    `/api/admin/leases/${deliveryId}/pdf?preview=1`,
  );
  expect(digest(await frozen.body())).toBe(pending.document_hash);
  await viewer.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/lease-delivery-dark.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(viewer.locator(".react-pdf__Page__canvas")).toBeVisible();
  await viewer
    .getByRole("button", { name: "Zoom in PDF", exact: true })
    .click();
  await expect(viewer.getByText("125%", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      viewer
        .locator(".lease-pdf-canvas")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
    )
    .toBe(true);
  await viewer.getByRole("button", { name: "Fit width", exact: true }).click();
  await expect(viewer.getByText("100%", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await viewer.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/lease-delivery-mobile.png" });
  expect(errors).toEqual([]);
});
