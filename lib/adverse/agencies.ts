// Consumer contact details verified October 17, 2026. Keep saved notices as snapshots.
export const agencyPresets = [
  {
    address: "P.O. Box 740241, Atlanta, GA 30374-0241",
    id: "equifax",
    label: "Equifax",
    name: "Equifax Information Services LLC",
    phone: "1-866-349-5191",
    source:
      "https://investor.equifax.com/news-events/press-releases/detail/52/update-regarding-six-free-equifax-credit-reports",
  },
  {
    address: "P.O. Box 2002, Allen, TX 75013",
    id: "experian",
    label: "Experian",
    name: "Experian Information Solutions, Inc.",
    phone: "1-888-397-3742",
    source: "https://www.experian.com/connect/legal/fcra-obligations",
  },
  {
    address: "2 Baldwin Place, P.O. Box 1000, Chester, PA 19022",
    id: "transunion",
    label: "TransUnion",
    name: "TransUnion Consumer Relations",
    phone: "1-800-888-4213",
    source:
      "https://www.transunion.com/docs/rev/business/clientResources/HowToReadCreditReport.pdf",
  },
  {
    address:
      "Attention: Consumer Dispute Team, P.O. Box 800, Woodlyn, PA 19094",
    id: "smartmove",
    label: "TransUnion SmartMove (rental screening)",
    name: "TransUnion Rental Screening Solutions, Inc.",
    phone: "1-800-230-9376 (Option 4)",
    source:
      "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/consumer-reporting-companies/companies-list/trans-union-smart-move/",
  },
] as const;
