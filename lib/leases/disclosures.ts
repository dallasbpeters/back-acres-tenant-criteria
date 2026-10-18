import type { LeaseValues } from "@/lib/management/leases";
export const disclosureFields = [
  "habitability_disclosure",
  "foreclosure_disclosure",
  "utility_details",
  "bedbug_disclosure",
  "lead_paint_knowledge",
  "lead_paint_records",
  "lead_records_receipt",
  "lead_pamphlet_receipt",
  "enclosures",
] as const;
// Transcribed from the supplied Avail lease, not inferred property conditions.
export const suppliedDisclosures: LeaseValues = {
  habitability_disclosure: "No known conditions affecting habitability.",
  foreclosure_disclosure: "No known foreclosure proceedings.",
  bedbug_disclosure:
    "There is no history of any bedbug infestation within the past year in the building or in any residence.",
  lead_paint_knowledge:
    "Lessor has no knowledge of lead-based paint and/or lead-based paint hazards in the housing.",
  lead_paint_records:
    "Lessor has no reports or records pertaining to lead-based paint and/or lead-based paint hazards in the housing.",
  utility_details:
    "Unless otherwise agreed in writing, if the Premises is separately metered for utilities, Tenant shall pay the utility company or authorized metering agency directly for all applicable charges for gas, electricity, water and other utilities serving the Premises, including, if applicable, telephone, internet, cable, and current used for electric heating, ventilation, air conditioning, hot water, etc., as such charges become due and payable.",
  lead_records_receipt:
    "At signing, Tenant must acknowledge receipt of all lead information, records, and reports listed above. Tenant initials: __________. No receipt or signature is recorded by preparing this draft.",
  lead_pamphlet_receipt:
    "At signing, Tenant must acknowledge receipt of Protect Your Family From Lead in Your Home. Tenant initials: __________. Provide the pamphlet before signing; preparing this draft does not record delivery.",
  enclosures:
    "Lead Paint Pamphlet\nBed Bug Fact Sheet\nHUD Pamphlet\nTexas Parking Rules Addendum\nFlood Disclosure",
};
export function sourceDisclosures(address: string): LeaseValues {
  // The supplied property facts only belong to this property.
  return /\b7800\s+back\s+acres\b/i.test(address)
    ? { ...suppliedDisclosures }
    : {};
}
export const disclosureChoices: Partial<
  Record<(typeof disclosureFields)[number], { label: string; value: string }[]>
> = {
  habitability_disclosure: [
    {
      label: "No known conditions",
      value: suppliedDisclosures.habitability_disclosure!,
    },
  ],
  foreclosure_disclosure: [
    {
      label: "No known proceedings",
      value: suppliedDisclosures.foreclosure_disclosure!,
    },
  ],
  bedbug_disclosure: [
    {
      label: "No infestation in the past year",
      value: suppliedDisclosures.bedbug_disclosure!,
    },
  ],
  lead_paint_knowledge: [
    {
      label: "No known lead paint or hazards",
      value: suppliedDisclosures.lead_paint_knowledge!,
    },
  ],
  lead_paint_records: [
    {
      label: "No records or reports available",
      value: suppliedDisclosures.lead_paint_records!,
    },
  ],
  utility_details: [
    {
      label: "Use the supplied lease’s utility terms",
      value: suppliedDisclosures.utility_details!,
    },
    {
      label: "Owner pays all utilities",
      value:
        "Landlord is responsible for all utility charges serving the Premises during the lease term.",
    },
    {
      label: "Tenant pays all utilities",
      value:
        "Tenant is responsible for gas, electricity, water, sewer, trash, and other utility charges serving the Premises during the lease term.",
    },
  ],
};
