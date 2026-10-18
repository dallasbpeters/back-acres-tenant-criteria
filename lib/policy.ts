/**
 * Final tenant selection criteria approved for publication by the property owner.
 * Each material revision needs a new version. It is recorded in confirmation emails.
 */
export const POLICY = {
  city: "Amarillo, TX 79119",
  items: [
    {
      detail:
        "Applicants should document combined gross monthly income of at least three times the monthly rent (currently $7,500 for $2,500 rent). Verifiable income may include wages, self-employment income, retirement income, and other lawful sources. Equivalent documentation will be considered when pay stubs are not applicable.",
      number: "01",
      title: "Income & ability to pay",
    },
    {
      detail:
        "Credit history may be reviewed for material payment delinquencies, unpaid collections, charge-offs, and outstanding obligations. These criteria do not establish a minimum credit score. Review will be conducted consistently and applicants may dispute inaccurate report information.",
      number: "02",
      title: "Credit history",
    },
    {
      detail:
        "Prior housing payment history, unpaid landlord balances, and documented material lease violations may be considered. Applicants who owned a home may provide comparable payment history in place of landlord references.",
      number: "03",
      title: "Rental or housing history",
    },
    {
      detail:
        "Relevant criminal conviction history may be considered on an individualized basis where permitted by law, including the nature, recency, and relationship of conduct to resident safety or property. Arrest records alone will not be treated as proof of wrongdoing.",
      number: "04",
      title: "Background review",
    },
    {
      detail:
        "Each adult applicant must submit a complete application and provide requested, legally permissible supporting information. Materially false or incomplete information may be grounds for denial after reasonable opportunity to clarify.",
      number: "05",
      title: "Complete & accurate application",
    },
    {
      detail:
        "Pets and other animals require written approval under the lease and applicable property rules. Requests involving assistance animals are evaluated separately as required by fair-housing law.",
      number: "06",
      title: "Animals & property rules",
    },
  ],
  propertyName: "Back Acres Rental",
  rent: 2500,
  revised: "October 10, 2026",
  // Equivalent statutory acknowledgment, kept close to the Texas Property Code language.
  statutoryAcknowledgment:
    "Signing this acknowledgment indicates that you have had the opportunity to review the landlord’s tenant selection criteria. The tenant selection criteria may include factors such as criminal history, credit history, current income, and rental history. If you do not meet the selection criteria, or if you provide inaccurate or incomplete information, your application may be rejected and your application fee will not be refunded.",
  street: "7800 Back Acres Rd",
  version: "FINAL-2026-10-10-v1",
} as const;

export function policyRecordText(): string {
  return [
    `${POLICY.propertyName}: Tenant Selection Criteria`,
    `Property: ${POLICY.street}, ${POLICY.city}`,
    `Version: ${POLICY.version}; revised ${POLICY.revised}`,
    ...POLICY.items.map(
      (item) => `${item.number}. ${item.title}: ${item.detail}`
    ),
    `ACKNOWLEDGMENT: ${POLICY.statutoryAcknowledgment}`,
    "This acknowledgment records receipt/opportunity to review criteria; it is not a lease or an approval of the application.",
  ].join("\n\n");
}

/** Shared criteria content; property identity is supplied by each listing. */
export function selectionCriteriaText(): string {
  return [
    ...POLICY.items.map(
      (item) => `${item.number}. ${item.title}: ${item.detail}`
    ),
    `ACKNOWLEDGMENT: ${POLICY.statutoryAcknowledgment}`,
  ].join("\n\n");
}
