export const removalKinds = [
  "property",
  "application",
  "leaseTemplate",
  "leaseDraft",
  "invoice",
  "rentSchedule",
  "residentLink",
  "maintenance",
  "notice",
] as const;
export type RemovalKind = (typeof removalKinds)[number];
export const removalLabels: Record<RemovalKind, string> = {
  application: "Application",
  invoice: "Payment request",
  leaseDraft: "Lease",
  leaseTemplate: "Lease document",
  maintenance: "Maintenance request",
  notice: "Adverse-action notice",
  property: "Property",
  rentSchedule: "Rent schedule",
  residentLink: "Resident link",
};
export const terminalSchedules = ["canceled", "completed", "released"];
export const terminalInvoices = ["void", "paid", "uncollectible"];
