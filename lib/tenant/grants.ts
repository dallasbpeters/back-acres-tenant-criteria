import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  managementEvents,
  residentLinks,
  tenantAccess,
  tenantInvitations,
} from "@/lib/db/schema";

export interface TenantGrant {
  invoiceIds: string[];
  name: string;
  propertyId: string;
  scheduleIds: string[];
}

/**
 * Connects one verified Clerk account to a property with explicit record
 * grants. One database transaction creates the internal maintenance identity,
 * the grant, the audit event and (when given) marks the invitation accepted.
 */
export async function grantTenantAccess({
  actor,
  clerkUserId,
  grant,
  invitationId,
}: {
  actor: string;
  clerkUserId: string;
  grant: TenantGrant;
  invitationId?: string;
}) {
  const d = db();
  const [existing] = await d
    .select()
    .from(tenantAccess)
    .where(
      and(
        eq(tenantAccess.clerkUserId, clerkUserId),
        eq(tenantAccess.propertyId, grant.propertyId)
      )
    );
  const id = existing?.id ?? randomUUID();
  const linkId = existing?.residentLinkId ?? randomUUID();
  const expiresAt = new Date(Date.now() + 365 * 86_400_000);
  const statements = [
    d
      .insert(residentLinks)
      .values({
        expiresAt,
        id: linkId,
        propertyId: grant.propertyId,
        residentName: grant.name,
      })
      .onConflictDoUpdate({
        set: { expiresAt, revoked: false },
        target: residentLinks.id,
      }),
    d
      .insert(tenantAccess)
      .values({
        clerkUserId,
        id,
        invoiceIds: grant.invoiceIds,
        name: grant.name,
        propertyId: grant.propertyId,
        residentLinkId: linkId,
        scheduleIds: grant.scheduleIds,
      })
      .onConflictDoUpdate({
        set: {
          invoiceIds: grant.invoiceIds,
          name: grant.name,
          revokedAt: null,
          scheduleIds: grant.scheduleIds,
        },
        target: [tenantAccess.propertyId, tenantAccess.clerkUserId],
      }),
    d.insert(managementEvents).values({
      action: invitationId ? "acceptTenantInvitation" : "assignTenantAccess",
      actor,
      detail: {
        invoiceIds: grant.invoiceIds,
        propertyId: grant.propertyId,
        scheduleIds: grant.scheduleIds,
      },
      entityId: id,
      id: randomUUID(),
    }),
  ] as const;
  if (invitationId) {
    await d.batch([
      ...statements,
      d
        .update(tenantInvitations)
        .set({ acceptedAt: new Date(), status: "accepted", tenantAccessId: id })
        .where(
          and(
            eq(tenantInvitations.id, invitationId),
            eq(tenantInvitations.status, "pending")
          )
        ),
    ]);
  } else {
    await d.batch(statements);
  }
  return id;
}
