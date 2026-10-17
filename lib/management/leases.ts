export const leaseFieldLabels = {
  property_name: "Property name",
  property_address: "Property address",
  landlord_name: "Landlord legal name",
  tenant_names: "Tenant legal names",
  start_date: "Lease start date",
  end_date: "Lease end date",
  monthly_rent: "Monthly rent",
  security_deposit: "Security deposit (formatted amount)",
  rent_due_day: "Rent due day",
  monthly_parking: "Monthly parking (formatted amount)",
  pet_deposit: "Pet deposit (formatted amount)",
  move_in_fee: "Move-in fee (formatted amount)",
  move_out_fee: "Move-out fee (formatted amount)",
  late_rent_fee: "Late rent fee (formatted amount)",
  landlord_email: "Landlord email",
  landlord_phone: "Landlord phone",
  emergency_contact: "Emergency contact",
  landlord_notice_address: "Landlord notice address",
  payment_instructions: "Payment instructions",
  habitability_disclosure: "Habitability disclosure",
  foreclosure_disclosure: "Foreclosure disclosure",
  enclosures: "Enclosures actually provided",
  lead_paint_knowledge: "Known lead paint / hazards or applicability",
  lead_paint_records: "Lead paint records / reports or applicability",
  lead_records_receipt: "Lead records receipt acknowledgment (draft wording)",
  lead_pamphlet_receipt: "Lead pamphlet receipt acknowledgment (draft wording)",
  bedbug_disclosure: "Bedbug history disclosure",
  utility_details: "Utility responsibilities and disclosure details",
} as const;
export const leaseFields = Object.keys(
  leaseFieldLabels,
) as (keyof typeof leaseFieldLabels)[];
export type LeaseValues = Partial<Record<(typeof leaseFields)[number], string>>;
export function templateFields(template: string) {
  return [
    ...new Set(
      [...template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]),
    ),
  ];
}
export function generateLease(template: string, values: LeaseValues) {
  const missing = new Set<string>();
  const body = template.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/g,
    (match, key: string) => {
      if (
        !leaseFields.includes(key as (typeof leaseFields)[number]) ||
        !values[key as keyof LeaseValues]?.trim()
      ) {
        missing.add(key);
        return match;
      }
      return values[key as keyof LeaseValues]!.trim();
    },
  );
  if (missing.size)
    throw new Error(
      `Complete or replace these placeholders: ${[...missing].join(", ")}`,
    );
  return body;
}
