import test from "node:test";
import assert from "node:assert/strict";
import { generateText } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { LeaseDetail, wordingDocument } from "../lib/leases/wording";
import { availLeaseTemplate } from "../lib/leases/avail-template";
import { templateFields } from "../lib/management/leases";
import {
  initialLeaseValues,
  normalizedLeaseValues,
  leaseFormValues,
  questionsFor,
  missingLeaseDetails,
} from "../lib/management/lease-workflow";
test("visual wording editor preserves the supplied lease and every automatic detail", () => {
  const document = wordingDocument(availLeaseTemplate);
  assert.equal(
    generateText(document, [StarterKit, LeaseDetail], { blockSeparator: "\n" }),
    availLeaseTemplate,
  );
  const encoded = JSON.stringify(document);
  assert.equal(encoded.includes("{{"), false);
  assert.match(encoded, /leaseDetail/);
});
test("guided questions cover every source field without inventing disclosure facts", () => {
  const questions = [
    ...questionsFor(availLeaseTemplate, 0),
    ...questionsFor(availLeaseTemplate, 1),
    ...questionsFor(availLeaseTemplate, 2),
    "property_name",
    "property_address",
  ];
  assert.deepEqual(
    new Set(questions),
    new Set(templateFields(availLeaseTemplate)),
  );
  const initial = initialLeaseValues({
    name: "Test",
    address: "1 Test",
    rentCents: 250000,
  });
  assert.equal(initial.monthly_rent, "2500");
  assert.equal(initial.tenant_names, undefined);
  assert.equal(initial.habitability_disclosure, undefined);
  assert.ok(
    missingLeaseDetails(availLeaseTemplate, initial).includes(
      "Tenant legal names",
    ),
  );
});
test("money and dates survive save and reopening, and invalid terms are rejected", () => {
  const values = {
    monthly_rent: "2500",
    security_deposit: "1500.25",
    start_date: "2026-11-01",
    end_date: "2027-10-31",
  };
  const saved = normalizedLeaseValues(values);
  assert.equal(saved.monthly_rent, "$2,500.00");
  assert.equal(saved.security_deposit, "$1,500.25");
  assert.equal(leaseFormValues(saved).security_deposit, "1500.25");
  assert.throws(() => normalizedLeaseValues({ monthly_rent: "1.001" }));
  assert.throws(() => normalizedLeaseValues({ monthly_rent: "-1" }));
  assert.throws(() =>
    normalizedLeaseValues({ start_date: "2026-11-01", end_date: "2026-10-01" }),
  );
});

test("supplied disclosures are property-specific and never invent tenant receipt", async () => {
  const { sourceDisclosures, suppliedDisclosures } = await import(
    "../lib/leases/disclosures"
  );
  const supplied = sourceDisclosures(
    "7800 Back Acres Rd. Amarillo Texas 79119",
  );
  assert.equal(
    supplied.habitability_disclosure,
    "No known conditions affecting habitability.",
  );
  assert.match(supplied.enclosures!, /Flood Disclosure/);
  assert.match(
    supplied.utility_details!,
    /if the Premises is separately metered/,
  );
  assert.match(supplied.lead_pamphlet_receipt!, /At signing/);
  assert.doesNotMatch(supplied.lead_pamphlet_receipt!, /Lessee has received/);
  assert.deepEqual(sourceDisclosures("10 Other Street"), {});
  assert.equal(Object.keys(suppliedDisclosures).length, 9);
});
test("rich lease content preserves formatting, list numbering, and PDF export", async () => {
  const { textDocument, documentText, documentLines, leaseDocumentSchema } =
    await import("../lib/leases/document");
  const { leasePdf } = await import("../lib/leases/pdf");
  const { PDFDocument } = await import("pdf-lib");
  assert.equal(
    documentText(textDocument(availLeaseTemplate)),
    availLeaseTemplate,
  );
  const document = leaseDocumentSchema.parse({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Lease terms" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Important term",
            marks: [{ type: "bold" }, { type: "italic" }],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Third item" }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(
    documentText(document),
    "Lease terms\nImportant term\n3. Third item",
  );
  assert.equal(documentLines(document)[1].runs[0].bold, true);
  const pdf = await PDFDocument.load(
    await leasePdf(documentText(document), "test", document),
  );
  assert.equal(pdf.getPageCount(), 1);
  assert.throws(() =>
    leaseDocumentSchema.parse({ type: "script", text: "bad" }),
  );
});
