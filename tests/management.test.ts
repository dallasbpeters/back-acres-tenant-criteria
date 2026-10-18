import test from "node:test";
import assert from "node:assert/strict";
import { generateLease, type LeaseValues } from "../lib/management/leases";
import {
  applicationSchema,
  invoiceSchema,
  rentScheduleSchema,
  propertySchema,
} from "../lib/management/model";
const values: LeaseValues = {
  property_name: "Test",
  property_address: "1 Test St",
  landlord_name: "Owner",
  tenant_names: "Tenant",
  start_date: "2026-11-01",
  end_date: "2027-10-31",
  monthly_rent: "$2,500.00",
  security_deposit: "$2,500.00",
};
test("lease substitution preserves original wording and refuses missing or unknown fields", () => {
  assert.equal(
    generateLease("Tenant: {{tenant_names}}\nRent: {{ monthly_rent }}", values),
    "Tenant: Tenant\nRent: $2,500.00",
  );
  assert.throws(() => generateLease("{{unknown}}", values));
  assert.throws(() =>
    generateLease("{{tenant_names}}", { ...values, tenant_names: "" }),
  );
});
test("intake requires acknowledgments and invoice amounts are integer cents", () => {
  assert.equal(applicationSchema.safeParse({}).success, false);
  assert.equal(
    invoiceSchema.safeParse({
      propertyId: crypto.randomUUID(),
      payerName: "Test",
      payerEmail: "test@example.com",
      description: "Rent",
      category: "rent",
      amountCents: 2500.5,
      dueDate: "2026-11-01",
    }).success,
    false,
  );
  assert.equal(propertySchema.safeParse({ published: true }).success, false);
});

test("rent schedules require owner authorization and a finite installment count", () => {
  const valid = {
    propertyId: crypto.randomUUID(),
    payerName: "Tenant",
    payerEmail: "TENANT@example.com",
    monthlyCents: 250000,
    firstDate: "2026-11-01",
    installments: 12,
    authorized: true,
  };
  assert.equal(
    rentScheduleSchema.parse(valid).payerEmail,
    "tenant@example.com",
  );
  for (const patch of [
    { authorized: false },
    { installments: 0 },
    { installments: 61 },
    { monthlyCents: 2500.5 },
  ])
    assert.equal(
      rentScheduleSchema.safeParse({ ...valid, ...patch }).success,
      false,
    );
});

test("property amenities accept known features and preserve legacy listings", () => {
  const property = {
    name: "Test",
    address: "1 Test St",
    description: "Test property",
    rentCents: 100000,
    bedrooms: 2,
    bathrooms: 1,
    availableDate: "",
    contact: "Owner",
    published: false,
    acceptingApplications: false,
  };
  assert.equal(propertySchema.safeParse(property).success, true);
  assert.deepEqual(
    propertySchema.parse({ ...property, amenities: ["yard", "patio"] })
      .amenities,
    ["yard", "patio"],
  );
  assert.equal(
    propertySchema.safeParse({ ...property, amenities: ["unverified_feature"] })
      .success,
    false,
  );
  assert.deepEqual(
    propertySchema.parse({ ...property, amenities: [] }).amenities,
    [],
  );
});
