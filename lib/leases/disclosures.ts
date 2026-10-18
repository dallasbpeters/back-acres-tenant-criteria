import { requireValue } from "@/lib/required";

const pattern1 = /\b7800\s+back\s+acres\b/i;

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
  bedbug_disclosure:
    "There is no history of any bedbug infestation within the past year in the building or in any residence.",
  enclosures:
    "Lead Paint Pamphlet\nBed Bug Fact Sheet\nHUD Pamphlet\nTexas Parking Rules Addendum\nFlood Disclosure",
  foreclosure_disclosure: "No known foreclosure proceedings.",
  habitability_disclosure: "No known conditions affecting habitability.",
  lead_paint_knowledge:
    "Lessor has no knowledge of lead-based paint and/or lead-based paint hazards in the housing.",
  lead_paint_records:
    "Lessor has no reports or records pertaining to lead-based paint and/or lead-based paint hazards in the housing.",
  lead_pamphlet_receipt:
    "At signing, Tenant must acknowledge receipt of Protect Your Family From Lead in Your Home. Tenant initials: __________. Provide the pamphlet before signing; preparing this draft does not record delivery.",
  lead_records_receipt:
    "At signing, Tenant must acknowledge receipt of all lead information, records, and reports listed above. Tenant initials: __________. No receipt or signature is recorded by preparing this draft.",
  utility_details:
    "Unless otherwise agreed in writing, if the Premises is separately metered for utilities, Tenant shall pay the utility company or authorized metering agency directly for all applicable charges for gas, electricity, water and other utilities serving the Premises, including, if applicable, telephone, internet, cable, and current used for electric heating, ventilation, air conditioning, hot water, etc., as such charges become due and payable.",
};
export function sourceDisclosures(address: string): LeaseValues {
  // The supplied property facts only belong to this property.
  return pattern1.test(address) ? { ...suppliedDisclosures } : {};
}
export const disclosureChoices: Partial<
  Record<(typeof disclosureFields)[number], { label: string; value: string }[]>
> = {
  bedbug_disclosure: [
    {
      label: "No infestation in the past year",
      value: requireValue(
        suppliedDisclosures.bedbug_disclosure,
        "Expected suppliedDisclosures.bedbug_disclosure"
      ),
    },
  ],
  foreclosure_disclosure: [
    {
      label: "No known proceedings",
      value: requireValue(
        suppliedDisclosures.foreclosure_disclosure,
        "Expected suppliedDisclosures.foreclosure_disclosure"
      ),
    },
  ],
  habitability_disclosure: [
    {
      label: "No known conditions",
      value: requireValue(
        suppliedDisclosures.habitability_disclosure,
        "Expected suppliedDisclosures.habitability_disclosure"
      ),
    },
  ],
  lead_paint_knowledge: [
    {
      label: "No known lead paint or hazards",
      value: requireValue(
        suppliedDisclosures.lead_paint_knowledge,
        "Expected suppliedDisclosures.lead_paint_knowledge"
      ),
    },
  ],
  lead_paint_records: [
    {
      label: "No records or reports available",
      value: requireValue(
        suppliedDisclosures.lead_paint_records,
        "Expected suppliedDisclosures.lead_paint_records"
      ),
    },
  ],
  utility_details: [
    {
      label: "Use the supplied lease’s utility terms",
      value: requireValue(
        suppliedDisclosures.utility_details,
        "Expected suppliedDisclosures.utility_details"
      ),
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
