import { z } from "zod";
import { POLICY, selectionCriteriaText } from "../policy";
import { amenityIds } from "./amenities";

const text = (max = 300) => z.string().trim().max(max);
const required = (max = 300) => text(max).min(1);
export function listingSlug(address: string) {
  return (
    address
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64)
      .replace(/-$/g, "") || "property"
  );
}
export const propertySchema = z
  .object({
    acceptingApplications: z.boolean(),
    address: required(500),
    amenities: z.array(z.enum(amenityIds)).max(amenityIds.length).optional(),
    availableDate: text(10),
    bathrooms: z.number().min(0).max(50),
    bedrooms: z.number().int().min(0).max(50),
    contact: required(500),
    description: required(10_000),
    emergencyContact: text(500).optional().default(""),
    name: required(),
    published: z.boolean(),
    rentCents: z.number().int().min(0).max(10_000_000),
  })
  .transform((data) => ({
    ...data,
    criteria: selectionCriteriaText(),
    criteriaVersion: POLICY.version,
    slug: listingSlug(data.address),
  }));
export type PropertyInput = z.infer<typeof propertySchema>;
export const applicationSchema = z.object({
  accuracy: z.literal(true),
  acknowledgment: z.literal(true),
  currentAddress: required(500),
  email: z.string().trim().email().max(254),
  housingHistory: required(4000),
  incomeDetails: required(2000),
  monthlyIncome: z.number().min(0).max(100_000_000),
  moveDate: required(10).regex(/^\d{4}-\d{2}-\d{2}$/),
  name: required(),
  notes: text(3000),
  occupants: z.number().int().min(1).max(50),
  phone: required(50),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;
export const maintenanceSchema = z.object({
  accessNotes: text(2000),
  description: required(5000),
  email: z.string().trim().email().max(254),
  name: required(),
  phone: required(50),
  priority: z.enum(["routine", "urgent"]),
  subject: required(200),
});
export const invoiceSchema = z.object({
  amountCents: z.number().int().min(50).max(10_000_000),
  category: z.enum(["rent", "deposit", "application_fee", "other"]),
  description: required(500),
  dueDate: required(10).regex(/^\d{4}-\d{2}-\d{2}$/),
  payerEmail: z.string().trim().email().max(254),
  payerName: required(),
  propertyId: z.string().uuid(),
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
    currency: "USD",
    style: "currency",
  }).format(cents / 100);
}

export const rentScheduleSchema = z.object({
  authorized: z.literal(true),
  collection: z.enum(["invoice", "ach"]).default("invoice"),
  firstDate: required(10).regex(/^\d{4}-\d{2}-\d{2}$/),
  installments: z.number().int().min(1).max(60),
  monthlyCents: z.number().int().min(50).max(10_000_000),
  payerEmail: z.string().trim().email().max(254).toLowerCase(),
  payerName: required(),
  propertyId: z.string().uuid(),
});
