// biome-ignore-all lint/suspicious/useAwait: Async transport stubs intentionally preserve native promise and rejection behavior, including faults before the first await.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { logoPng, signaturePng } from "../lib/leases/branding";
import { leasePdf } from "../lib/leases/pdf";
import {
  digest,
  packetInput,
  SIGNING_CONSENT,
  SIGNING_CONSENT_VERSION,
  signingEvidence,
  signingText,
} from "../lib/leases/signing-model";

test("signing requires distinct named tenants and landlord with explicit owner review", () => {
  const signers = [
    { email: "TENANT@example.invalid", name: "Test Tenant", role: "tenant" },
    { email: "owner@example.invalid", name: "Test Owner", role: "landlord" },
  ];
  const data = { draftId: crypto.randomUUID(), reviewed: true, signers };
  assert.equal(
    packetInput.parse(data).signers[0].email,
    "tenant@example.invalid"
  );
  assert.equal(
    packetInput.safeParse({ ...data, reviewed: false }).success,
    false
  );
  assert.equal(
    packetInput.safeParse({ ...data, signers: [signers[0], signers[0]] })
      .success,
    false
  );
  assert.equal(
    packetInput.safeParse({ ...data, signers: [signers[0]] }).success,
    false
  );
});
test("logo PNG and SVG rasterize safely; unsupported, oversized, and invalid images fail and unsafe SVG content is removed", async () => {
  const png = await sharp({
    create: { background: "#215132", channels: 4, height: 40, width: 80 },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await sharp(await logoPng(png, "image/png")).metadata()).format,
    "png"
  );
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><script>alert(1)</script><foreignObject><div>unsafe</div></foreignObject><image href="file:///etc/passwd"/><path d="M0 0h100v50H0z" fill="#215132"/></svg>'
  );
  assert.equal(
    (await sharp(await logoPng(svg, "image/svg+xml")).metadata()).format,
    "png"
  );
  const styled = await logoPng(
    Buffer.from(
      '<svg width="30" height="20"><rect width="30" height="20" style="fill:#215132"/></svg>'
    ),
    "image/svg+xml"
  );
  const styledPixel = await sharp(styled).raw().toBuffer();
  assert.deepEqual([...styledPixel.subarray(0, 3)], [33, 81, 50]);
  await assert.rejects(() =>
    logoPng(
      Buffer.from(
        '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>'
      ),
      "image/svg+xml"
    )
  );
  await assert.rejects(() => logoPng(Buffer.from("fake"), "image/png"));
  await assert.rejects(() => logoPng(Buffer.alloc(2_000_001), "image/png"));
});
test("signature validation rejects blank and malformed drawings and normalizes real ink", async () => {
  const blank = await sharp({
    create: { background: "white", channels: 4, height: 280, width: 900 },
  })
    .png()
    .toBuffer();
  await assert.rejects(() =>
    signaturePng(`data:image/png;base64,${blank.toString("base64")}`)
  );
  await assert.rejects(() => signaturePng("data:image/png;base64,ZmFrZQ=="));
  const image = await logoPng(
    Buffer.from(
      '<svg width="900" height="280"><path d="M30 170 Q180 20 200 150T600 160" fill="none" stroke="black" stroke-width="4"/></svg>'
    ),
    "image/svg+xml"
  );
  assert.ok(
    (await signaturePng(`data:image/png;base64,${image.toString("base64")}`))
      .length
  );
});
test("branded PDF retains lease text and document fingerprints change on changed content", async () => {
  const logo = await logoPng(
    Buffer.from(
      '<svg width="100" height="50"><rect width="100" height="50" fill="green"/></svg>'
    ),
    "image/svg+xml"
  );
  const bytes = await leasePdf(
    "Residential lease\nRent: $2,500",
    crypto.randomUUID(),
    null,
    {
      forSigning: true,
      logoPng: logo.toString("base64"),
      name: "Back Acres Test",
    }
  );
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), "Residential lease");
  assert.ok(pdf.getPageCount() >= 1);
  assert.notEqual(
    digest(bytes),
    digest(Buffer.concat([bytes, Buffer.from("changed")]))
  );
  const data = {
    consent: SIGNING_CONSENT,
    consentVersion: SIGNING_CONSENT_VERSION,
    documentHash: digest(bytes),
    email: "tenant@example.invalid",
    ip: "test",
    name: "Test Tenant",
    packetId: "packet",
    pdfViewedAt: "2026-10-17T09:59:30.000Z",
    role: "tenant",
    signatureHash: digest(logo),
    signedAt: "2026-10-17T10:00:00.000Z",
    signerId: "signer",
    userAgent: "test",
    verifiedAt: "2026-10-17T09:59:00.000Z",
  };
  assert.notEqual(
    signingEvidence(data).hash,
    signingEvidence({ ...data, documentHash: "different" }).hash
  );
  assert.equal(
    JSON.parse(signingEvidence(data).canonical).consent,
    SIGNING_CONSENT
  );
  assert.ok(
    !signingText(
      "TEXAS RESIDENTIAL LEASE - DRAFT\nDraft only. No signatures have been collected by this website."
    ).includes("DRAFT")
  );
});

test("lease email sends only to the individual signer with bounded delivery and idempotency", async () => {
  const { sendLeaseMail } = await import("../lib/leases/mail");
  const previousKey = process.env.RESEND_API_KEY,
    previousFrom = process.env.FROM_EMAIL;
  process.env.RESEND_API_KEY = "test-fixture-only";
  process.env.FROM_EMAIL = "owner@example.invalid";
  try {
    let calls = 0;
    const response = await sendLeaseMail(
      {
        subject: "Review your lease",
        text: "Private test link",
        to: "tenant@example.invalid",
      },
      async (url, init) => {
        calls += 1;
        assert.equal(url, "https://api.resend.com/emails");
        assert.ok(init?.signal);
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(body.to, ["tenant@example.invalid"]);
        assert.equal(body.from, "owner@example.invalid");
        assert.ok(
          new Headers(init?.headers)
            .get("Idempotency-Key")
            ?.startsWith("lease-")
        );
        return new Response('{"id":"test"}', { status: 200 });
      }
    );
    assert.equal(response.ok, true);
    assert.equal(calls, 1);
    const rejection = await sendLeaseMail(
      { subject: "Test", text: "Test", to: "tenant@example.invalid" },
      async () => new Response("{}", { status: 403 })
    );
    assert.equal(rejection.ok, false);
  } finally {
    if (previousKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = previousKey;
    }
    if (previousFrom === undefined) {
      delete process.env.FROM_EMAIL;
    } else {
      process.env.FROM_EMAIL = previousFrom;
    }
  }
});

test("SVG uploads remove exported DTDs and external dependencies while retaining local artwork", async () => {
  const artwork =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><rect width="30" height="20" fill="#215132"/></svg>';
  const expected = await logoPng(Buffer.from(artwork), "image/svg+xml");
  const declarations = [
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "https://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    '<!DOCTYPE svg [<!ENTITY remote SYSTEM "https://example.invalid/secret"><!ENTITY local SYSTEM "file:///etc/passwd"><!ENTITY parameter "nested [ > ]">]>',
    '<!DOCTYPE svg [<!-- unmatched ] [ > in a comment --><!ENTITY remote SYSTEM "https://example.invalid/secret">]>',
  ];
  await Promise.all(
    declarations.map(async (declaration) => {
      const input = `${declaration}<?xml-stylesheet href="https://example.invalid/style.css"?>${artwork.replace("</svg>", '<title>&remote;</title><style>@import url(https://example.invalid/style.css);</style><image href="https://example.invalid/image.png"/><use href="https://example.invalid/symbols.svg#logo"/><path d="M0 0h1v1z" fill="url(https://example.invalid/paint.svg#paint)" opacity="0"/></svg>')}`;
      assert.deepEqual(
        await logoPng(Buffer.from(input), "image/svg+xml"),
        expected
      );
    })
  );
});
