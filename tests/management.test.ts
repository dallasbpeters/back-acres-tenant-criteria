import assert from "node:assert/strict";
import test from "node:test";
import { generateLease, type LeaseValues } from "../lib/management/leases";
import {
  applicationSchema,
  invoiceSchema,
  propertySchema,
  rentScheduleSchema,
} from "../lib/management/model";

const values: LeaseValues = {
  end_date: "2027-10-31",
  landlord_name: "Owner",
  monthly_rent: "$2,500.00",
  property_address: "1 Test St",
  property_name: "Test",
  security_deposit: "$2,500.00",
  start_date: "2026-11-01",
  tenant_names: "Tenant",
};
test("lease substitution preserves original wording and refuses missing or unknown fields", () => {
  assert.equal(
    generateLease("Tenant: {{tenant_names}}\nRent: {{ monthly_rent }}", values),
    "Tenant: Tenant\nRent: $2,500.00"
  );
  assert.throws(() => generateLease("{{unknown}}", values));
  assert.throws(() =>
    generateLease("{{tenant_names}}", { ...values, tenant_names: "" })
  );
});
test("intake requires acknowledgments and invoice amounts are integer cents", () => {
  assert.equal(applicationSchema.safeParse({}).success, false);
  assert.equal(
    invoiceSchema.safeParse({
      amountCents: 2500.5,
      category: "rent",
      description: "Rent",
      dueDate: "2026-11-01",
      payerEmail: "test@example.com",
      payerName: "Test",
      propertyId: crypto.randomUUID(),
    }).success,
    false
  );
  assert.equal(propertySchema.safeParse({ published: true }).success, false);
});

test("rent schedules require owner authorization and a finite installment count", () => {
  const valid = {
    authorized: true,
    firstDate: "2026-11-01",
    installments: 12,
    monthlyCents: 250_000,
    payerEmail: "TENANT@example.com",
    payerName: "Tenant",
    propertyId: crypto.randomUUID(),
  };
  assert.equal(
    rentScheduleSchema.parse(valid).payerEmail,
    "tenant@example.com"
  );
  for (const patch of [
    { authorized: false },
    { installments: 0 },
    { installments: 61 },
    { monthlyCents: 2500.5 },
  ]) {
    assert.equal(
      rentScheduleSchema.safeParse({ ...valid, ...patch }).success,
      false
    );
  }
});

test("property amenities accept known features and preserve legacy listings", () => {
  const property = {
    acceptingApplications: false,
    address: "1 Test St",
    availableDate: "",
    bathrooms: 1,
    bedrooms: 2,
    contact: "Owner",
    description: "Test property",
    name: "Test",
    published: false,
    rentCents: 100_000,
  };
  assert.equal(propertySchema.safeParse(property).success, true);
  assert.deepEqual(
    propertySchema.parse({ ...property, amenities: ["yard", "patio"] })
      .amenities,
    ["yard", "patio"]
  );
  assert.equal(
    propertySchema.safeParse({ ...property, amenities: ["unverified_feature"] })
      .success,
    false
  );
  assert.deepEqual(
    propertySchema.parse({ ...property, amenities: [] }).amenities,
    []
  );
});
