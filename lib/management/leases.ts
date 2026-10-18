import { requireValue } from "@/lib/required";

export const leaseFieldLabels = {
  bedbug_disclosure: "Bedbug history disclosure",
  emergency_contact: "Emergency contact",
  enclosures: "Enclosures actually provided",
  end_date: "Lease end date",
  foreclosure_disclosure: "Foreclosure disclosure",
  habitability_disclosure: "Habitability disclosure",
  landlord_email: "Landlord email",
  landlord_name: "Landlord legal name",
  landlord_notice_address: "Landlord notice address",
  landlord_phone: "Landlord phone",
  late_rent_fee: "Late rent fee (formatted amount)",
  lead_paint_knowledge: "Known lead paint / hazards or applicability",
  lead_paint_records: "Lead paint records / reports or applicability",
  lead_pamphlet_receipt: "Lead pamphlet receipt acknowledgment (draft wording)",
  lead_records_receipt: "Lead records receipt acknowledgment (draft wording)",
  monthly_parking: "Monthly parking (formatted amount)",
  monthly_rent: "Monthly rent",
  move_in_fee: "Move-in fee (formatted amount)",
  move_out_fee: "Move-out fee (formatted amount)",
  payment_instructions: "Payment instructions",
  pet_deposit: "Pet deposit (formatted amount)",
  property_address: "Property address",
  property_name: "Property name",
  rent_due_day: "Rent due day",
  security_deposit: "Security deposit (formatted amount)",
  start_date: "Lease start date",
  tenant_names: "Tenant legal names",
  utility_details: "Utility responsibilities and disclosure details",
} as const;
export const leaseFields = Object.keys(
  leaseFieldLabels
) as (keyof typeof leaseFieldLabels)[];
export type LeaseValues = Partial<Record<(typeof leaseFields)[number], string>>;
export function templateFields(template: string) {
  return [
    ...new Set(
      [...template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1])
    ),
  ];
}
export function generateLease(template: string, values: LeaseValues) {
  const missing = new Set<string>();
  const body = template.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/g,
    (match, key: string) => {
      if (
        !(
          leaseFields.includes(key as (typeof leaseFields)[number]) &&
          values[key as keyof LeaseValues]?.trim()
        )
      ) {
        missing.add(key);
        return match;
      }
      return requireValue(
        values[key as keyof LeaseValues],
        "Expected values[key as keyof LeaseValues]"
      ).trim();
    }
  );
  if (missing.size) {
    throw new Error(
      `Complete or replace these placeholders: ${[...missing].join(", ")}`
    );
  }
  return body;
}
