import { suppliedDisclosures } from "../leases/disclosures";
import { dollars } from "./model";
import {
  leaseFields,
  leaseFieldLabels,
  templateFields,
  type LeaseValues,
} from "./leases";
export type LeaseField = keyof typeof leaseFieldLabels;
export const leaseSteps = [
  "Property & people",
  "Dates & payments",
  "Disclosures",
  "Review",
];
export const questionGroups: LeaseField[][] = [
  [
    "tenant_names",
    "landlord_name",
    "landlord_email",
    "landlord_phone",
    "landlord_notice_address",
    "emergency_contact",
  ],
  [
    "start_date",
    "end_date",
    "monthly_rent",
    "security_deposit",
    "rent_due_day",
    "monthly_parking",
    "pet_deposit",
    "move_in_fee",
    "move_out_fee",
    "late_rent_fee",
    "payment_instructions",
  ],
  [
    "habitability_disclosure",
    "foreclosure_disclosure",
    "utility_details",
    "bedbug_disclosure",
    "lead_paint_knowledge",
    "lead_paint_records",
    "lead_records_receipt",
    "lead_pamphlet_receipt",
    "enclosures",
  ],
];
export const moneyFields: LeaseField[] = [
  "monthly_rent",
  "security_deposit",
  "monthly_parking",
  "pet_deposit",
  "move_in_fee",
  "move_out_fee",
];
export const questionLabels: Partial<Record<LeaseField, string>> = {
  tenant_names: "Tenant legal names",
  security_deposit: "Security deposit",
  monthly_parking: "Monthly parking",
  pet_deposit: "Pet deposit",
  move_in_fee: "Move-in fee",
  move_out_fee: "Move-out fee",
  late_rent_fee: "Late fee",
  enclosures: "Attachments provided with this lease",
  lead_paint_knowledge: "Known lead paint or hazards",
  lead_paint_records: "Available lead paint records",
  lead_records_receipt: "Tenant acknowledgment of lead records",
  lead_pamphlet_receipt: "Tenant acknowledgment of lead pamphlet",
};
export const fieldLabel = (key: string) =>
  questionLabels[key as LeaseField] ||
  leaseFieldLabels[key as LeaseField] ||
  key.replaceAll("_", " ");
export function questionsFor(body: string, step: number) {
  const needed = new Set([
    ...templateFields(body),
    "tenant_names",
    "landlord_name",
    "start_date",
    "end_date",
    "security_deposit",
    "monthly_rent",
  ]);
  return (questionGroups[step] ?? []).filter((key) => needed.has(key));
}
export function initialLeaseValues(property?: {
  name: string;
  address: string;
  rentCents: number;
  emergencyContact?: string;
}): LeaseValues {
  return {
    lead_records_receipt: suppliedDisclosures.lead_records_receipt,
    lead_pamphlet_receipt: suppliedDisclosures.lead_pamphlet_receipt,
    property_name: property?.name ?? "",
    property_address: property?.address ?? "",
    monthly_rent: property ? String(property.rentCents / 100) : "",
    rent_due_day: "1",
    monthly_parking: "0",
    pet_deposit: "0",
    move_in_fee: "0",
    move_out_fee: "0",
    emergency_contact: property?.emergencyContact || "",
  };
}
export function leaseFormValues(values: LeaseValues): LeaseValues {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      moneyFields.includes(key as LeaseField)
        ? (value ?? "").replace(/[$,]/g, "")
        : value,
    ]),
  );
}
export function normalizedLeaseValues(values: LeaseValues): LeaseValues {
  const normalized = { ...values };
  for (const key of moneyFields) {
    const raw = normalized[key]?.trim();
    if (!raw) continue;
    const amount = Number(raw.replace(/[$,]/g, ""));
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > 100000 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    )
      throw Error(`Enter a valid amount for ${fieldLabel(key)}.`);
    normalized[key] = dollars(Math.round(amount * 100));
  }
  if (
    normalized.start_date &&
    normalized.end_date &&
    normalized.end_date <= normalized.start_date
  )
    throw Error("The lease end date must be after the start date.");
  return normalized;
}
export function missingLeaseDetails(body: string, values: LeaseValues) {
  return templateFields(body)
    .filter(
      (key) =>
        !leaseFields.includes(key as LeaseField) ||
        !values[key as LeaseField]?.trim(),
    )
    .map(fieldLabel);
}
