import test from "node:test";
import assert from "node:assert/strict";
import { documentLines, textDocument } from "../lib/leases/document";
import { leaseTerms } from "../lib/leases/terms";

test("lease terms preserve labels and amounts and stop before tenant wording", () => {
  const lines = documentLines(
    textDocument(
      "Property: Example\nTERMS\nStart date: 2026-10-17\nEnd date: 2027-10-17\nMonthly rent: $2,500.00\nRent due on: 1\nMonthly parking: $0.00\nSecurity deposit: $2,500.00\nPet deposit: $0.00\nMove-in fee: $0.00\nMove-out fee: $0.00\nLate rent fee: $50.00\n\nTENANTS\nSample Tenant",
    ),
  );
  const summary = leaseTerms(lines, 1)!;
  assert.equal(summary.fields.length, 10);
  assert.deepEqual(summary.fields[2], {
    label: "Monthly rent:",
    value: "$2,500.00",
  });
  assert.deepEqual(summary.fields.at(-1), {
    label: "Late rent fee:",
    value: "$50.00",
  });
  assert.equal(lines[summary.end + 2].runs[0].text, "TENANTS");
  assert.equal(leaseTerms(lines, 0), null);
});
test("custom prose stays outside the grid and unsupported summaries retain paragraph layout", () => {
  const lines = documentLines(
    textDocument(
      "TERMS\nRent: $1,000\nDeposit: $500\nDo not alter this additional condition.\nTENANTS\nSample Tenant",
    ),
  );
  const summary = leaseTerms(lines, 0)!;
  assert.equal(
    lines[summary.end + 1].runs[0].text,
    "Do not alter this additional condition.",
  );
  assert.equal(
    leaseTerms(documentLines(textDocument("TERMS\nThis is custom prose.")), 0),
    null,
  );
  assert.equal(
    leaseTerms(
      documentLines(
        textDocument(
          "TERMS\nRent: $1,000\nAdditional provision: " + "x".repeat(301),
        ),
      ),
      0,
    ),
    null,
  );
});
