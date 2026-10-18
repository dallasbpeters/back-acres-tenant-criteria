import assert from "node:assert/strict";
import test from "node:test";
import {
  brandedEmailHtml,
  defaultEmailBrand,
  textEmailHtml,
} from "../lib/email-layout";
import { sendLeaseMail } from "../lib/leases/mail";

const brand = {
  logoUrl: "https://rental.example.invalid/api/branding/logo?v=fixture",
  name: "Saved <Brand>",
};

test("branded email header uses the saved name and PNG logo URL", () => {
  const html = brandedEmailHtml(brand, "<p>Body</p>");
  assert.ok(html.includes("Saved &lt;Brand&gt;"));
  assert.ok(
    html.includes(
      '<img src="https://rental.example.invalid/api/branding/logo?v=fixture"'
    )
  );
  assert.ok(!html.toLowerCase().includes("<svg"));
  assert.ok(html.includes("<p>Body</p>"));
});

test("branded email header omits the image when no logo is saved", () => {
  const html = brandedEmailHtml(defaultEmailBrand, "");
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("Back Acres Rental"));
});

test("plain-text bodies are escaped and links stay clickable", () => {
  const html = textEmailHtml(
    "Hello <b>tenant</b>\n\nSign here:\nhttps://example.invalid/sign/abc"
  );
  assert.ok(html.includes("Hello &lt;b&gt;tenant&lt;/b&gt;"));
  assert.ok(html.includes('<a href="https://example.invalid/sign/abc"'));
  assert.ok(html.includes(">https://example.invalid/sign/abc</a>"));
  assert.equal(html.split("<p ").length - 1, 2);
});

test("lease email sends branded HTML alongside the plain text", async () => {
  const previousKey = process.env.RESEND_API_KEY,
    previousFrom = process.env.FROM_EMAIL;
  process.env.RESEND_API_KEY = "test-fixture-only";
  process.env.FROM_EMAIL = "owner@example.invalid";
  try {
    let body: Record<string, unknown> = {};
    await sendLeaseMail(
      {
        brand,
        subject: "Review your lease",
        text: "Sign: https://example.invalid/sign/abc",
        to: "tenant@example.invalid",
      },
      (_url, init) => {
        body = JSON.parse(String(init?.body));
        return Promise.resolve(new Response('{"id":"test"}', { status: 200 }));
      }
    );
    assert.equal(body.text, "Sign: https://example.invalid/sign/abc");
    assert.ok(String(body.html).includes("Saved &lt;Brand&gt;"));
    assert.ok(String(body.html).includes("/api/branding/logo?v=fixture"));
    assert.equal("brand" in body, false);
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
