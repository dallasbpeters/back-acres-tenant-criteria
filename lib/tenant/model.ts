import { z } from "zod";

export const tenantAssignmentSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  invoiceIds: z.array(z.string().uuid()).max(500).default([]),
  name: z.string().trim().min(1).max(300),
  propertyId: z.string().uuid(),
  scheduleIds: z.array(z.string().uuid()).max(100).default([]),
});

export function verifiedAccountId(
  users: {
    id: string;
    emailAddresses: {
      emailAddress: string;
      verification: { status: string } | null;
    }[];
  }[],
  email: string
) {
  const normalized = email.trim().toLowerCase();
  const matches = users.filter((user) =>
    user.emailAddresses.some(
      (address) =>
        address.emailAddress.toLowerCase() === normalized &&
        address.verification?.status === "verified"
    )
  );
  return matches.length === 1 ? matches[0].id : null;
}
