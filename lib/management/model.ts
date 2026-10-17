import { z } from "zod";
const text = (max = 300) => z.string().trim().max(max);
const required = (max = 300) => text(max).min(1);
export const propertySchema = z.object({
  name: required(),
  slug: required(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  address: required(500),
  description: required(10000),
  rentCents: z.number().int().min(0).max(10000000),
  bedrooms: z.number().int().min(0).max(50),
  bathrooms: z.number().min(0).max(50),
  availableDate: text(10),
  contact: required(500),
  emergencyContact: required(500),
  criteria: required(20000),
  criteriaVersion: required(100),
  published: z.boolean(),
  acceptingApplications: z.boolean(),
});
export type PropertyInput = z.infer<typeof propertySchema>;
export const applicationSchema = z.object({
  name: required(),
  email: z.string().trim().email().max(254),
  phone: required(50),
  currentAddress: required(500),
  monthlyIncome: z.number().min(0).max(100000000),
  incomeDetails: required(2000),
  housingHistory: required(4000),
  moveDate: required(10).regex(/^\d{4}-\d{2}-\d{2}$/),
  occupants: z.number().int().min(1).max(50),
  notes: text(3000),
  acknowledgment: z.literal(true),
  accuracy: z.literal(true),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;
export const maintenanceSchema = z.object({
  name: required(),
  email: z.string().trim().email().max(254),
  phone: required(50),
  subject: required(200),
  description: required(5000),
  priority: z.enum(["routine", "urgent"]),
  accessNotes: text(2000),
});
export const invoiceSchema = z.object({
  propertyId: z.string().uuid(),
  payerName: required(),
  payerEmail: z.string().trim().email().max(254),
  category: z.enum(["rent", "deposit", "application_fee", "other"]),
  description: required(500),
  amountCents: z.number().int().min(50).max(10000000),
  dueDate: required(10).regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const applicationStatuses = [
  "received",
  "reviewing",
  "screening_requested",
  "screening_received",
  "approved",
  "declined",
  "withdrawn",
] as const;
export const maintenanceStatuses = [
  "received",
  "scheduled",
  "in_progress",
  "resolved",
] as const;
export function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
