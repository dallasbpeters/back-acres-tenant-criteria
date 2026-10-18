export function authorizationReceiptText(receipt: {
  payerName: string;
  consentedAt: Date;
  authorizationText: string;
}) {
  return [
    "Back Acres Rental — ACH authorization copy",
    `Payer: ${receipt.payerName}`,
    `Accepted: ${receipt.consentedAt.toISOString()}`,
    "",
    receipt.authorizationText,
    "",
    "This records acceptance of the displayed payment terms. It does not confirm bank verification, scheduling, or payment settlement.",
    "Stripe separately supplies the bank mandate. Retain both documents.",
    "Contact the property owner to stop future payments or use your private enrollment page. Stopping payments does not change your lease obligations.",
  ].join("\n");
}
