import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeaseSigner } from "../components/management/lease-signer";
import { PropertyDescription } from "../components/management/property-description";

test("property descriptions keep separate base/modifier classes and every paragraph", () => {
  const html = renderToStaticMarkup(
    createElement(PropertyDescription, {
      grid: true,
      text: "First paragraph.\n\nSecond paragraph.",
    })
  );
  assert.ok(
    html.includes('class="property-description property-description--grid"')
  );
  assert.ok(html.includes("First paragraph."));
  assert.ok(html.includes("Second paragraph."));
});

test("private lease signing shows loading guidance before a record arrives", () => {
  const html = renderToStaticMarkup(
    createElement(LeaseSigner, { token: "isolated-fixture" })
  );
  assert.ok(html.includes("Loading signing request…"));
  assert.ok(!html.includes("Sign this lease"));
});
