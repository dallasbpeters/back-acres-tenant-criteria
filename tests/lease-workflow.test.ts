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
