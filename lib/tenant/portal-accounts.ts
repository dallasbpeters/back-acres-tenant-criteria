import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { properties, tenantAccess } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { tenantClerkClient } from "./client";
import { grantTenantAccess } from "./grants";
import {
  claimLeaseSignersByEmail,
  claimLeaseSignersByPhone,
} from "./lease-claims";
import { verifiedEmails, verifiedPhones } from "./leases";

export interface PortalAccount {
  createdAt: number;
  email: string | null;
  id: string;
  lastSignInAt: number | null;
  name: string;
  phone: string | null;
}

type ClerkUser = Awaited<
  ReturnType<Awaited<ReturnType<typeof tenantClerkClient>>["users"]["getUser"]>
>;
const display = (user: ClerkUser) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") ||
  user.username ||
  "Unnamed account";

/** Every tenant portal account in Clerk, newest first. */
export async function portalAccounts(): Promise<PortalAccount[]> {
  const client = await tenantClerkClient();
  const { data } = await client.users.getUserList({
    limit: 200,
    orderBy: "-created_at",
  });
  return data.map((user) => ({
    createdAt: user.createdAt,
    email:
      user.emailAddresses.find((a) => a.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null,
    id: user.id,
    lastSignInAt: user.lastSignInAt,
    name: display(user),
    phone:
      user.phoneNumbers.find((p) => p.id === user.primaryPhoneNumberId)
        ?.phoneNumber ??
      user.phoneNumbers[0]?.phoneNumber ??
      null,
  }));
}

/**
 * Connects an existing portal account to a property, then attaches leases
 * signed with its verified phone or email.
 */
export async function connectPortalAccount({
  actor,
  clerkUserId,
  propertyId,
}: {
  actor: string;
  clerkUserId: string;
  propertyId: string;
}) {
  const [property] = await db()
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), notRemoved(properties.id)));
  if (!property) {
    return { error: "Property not found.", status: 404 } as const;
  }
  const client = await tenantClerkClient();
  const user = await client.users.getUser(clerkUserId).catch(() => null);
  if (!user) {
    return { error: "Portal account not found.", status: 404 } as const;
  }
  const [active] = await db()
    .select({ id: tenantAccess.id })
    .from(tenantAccess)
    .where(
      and(
        eq(tenantAccess.clerkUserId, clerkUserId),
        eq(tenantAccess.propertyId, propertyId),
        isNull(tenantAccess.revokedAt)
      )
    );
  if (!active) {
    await grantTenantAccess({
      actor,
      clerkUserId,
      grant: {
        invoiceIds: [],
        name: display(user),
        propertyId,
        scheduleIds: [],
      },
    });
  }
  const leases =
    (await claimLeaseSignersByPhone(clerkUserId, verifiedPhones(user))) +
    (await claimLeaseSignersByEmail(clerkUserId, verifiedEmails(user)));
  return { leases, ok: true } as const;
}
