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
  property: "Property",
  application: "Application",
  leaseTemplate: "Lease document",
  leaseDraft: "Lease",
  invoice: "Payment request",
  rentSchedule: "Rent schedule",
  residentLink: "Resident link",
  maintenance: "Maintenance request",
  notice: "Adverse-action notice",
};
export const terminalSchedules = ["canceled", "completed", "released"];
export const terminalInvoices = ["void", "paid", "uncollectible"];
