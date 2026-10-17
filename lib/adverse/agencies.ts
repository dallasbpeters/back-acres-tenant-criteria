// Consumer contact details verified October 17, 2026. Keep saved notices as snapshots.
export const agencyPresets = [
  { id: "equifax", label: "Equifax", name: "Equifax Information Services LLC", address: "P.O. Box 740241, Atlanta, GA 30374-0241", phone: "1-866-349-5191", source: "https://investor.equifax.com/news-events/press-releases/detail/52/update-regarding-six-free-equifax-credit-reports" },
  { id: "experian", label: "Experian", name: "Experian Information Solutions, Inc.", address: "P.O. Box 2002, Allen, TX 75013", phone: "1-888-397-3742", source: "https://www.experian.com/connect/legal/fcra-obligations" },
  { id: "transunion", label: "TransUnion", name: "TransUnion Consumer Relations", address: "2 Baldwin Place, P.O. Box 1000, Chester, PA 19022", phone: "1-800-888-4213", source: "https://www.transunion.com/docs/rev/business/clientResources/HowToReadCreditReport.pdf" },
  { id: "smartmove", label: "TransUnion SmartMove (rental screening)", name: "TransUnion Rental Screening Solutions, Inc.", address: "Attention: Consumer Dispute Team, P.O. Box 800, Woodlyn, PA 19094", phone: "1-800-230-9376 (Option 4)", source: "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/consumer-reporting-companies/companies-list/trans-union-smart-move/" },
] as const;
