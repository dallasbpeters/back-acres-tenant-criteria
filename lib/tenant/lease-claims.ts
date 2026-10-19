import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  leaseDrafts,
  leasePackets,
  leaseSigners,
  tenantAccess,
  tenantInvitations,
} from "@/lib/db/schema";
import { digest } from "@/lib/leases/signing-model";
import { grantTenantAccess } from "./grants";

const codePattern = /^[a-f0-9]{64}$/;

/**
 * Attaches a portal account to the lease signer that made this one-time code
 * (from the signing page), then gives the account access to that property.
 * Holding the private signing link is the proof, so the account's email does
 * not need to match. Returns false when the code is unknown or expired.
 */
export async function claimLeaseSigner(clerkUserId: string, code: string) {
  if (!codePattern.test(code)) {
    return false;
  }
  const d = db();
  const [claimed] = await d
    .update(leaseSigners)
    .set({ claimExpiresAt: null, claimHash: null, clerkUserId })
    .where(
      and(
        eq(leaseSigners.claimHash, digest(code)),
        gt(leaseSigners.claimExpiresAt, sql`now()`),
        eq(leaseSigners.role, "tenant")
      )
    )
    .returning({
      email: leaseSigners.email,
      name: leaseSigners.name,
      packetId: leaseSigners.packetId,
    });
  if (!claimed) {
    return false;
  }
  const [lease] = await d
    .select({ propertyId: leaseDrafts.propertyId })
    .from(leasePackets)
    .innerJoin(leaseDrafts, eq(leasePackets.draftId, leaseDrafts.id))
    .where(eq(leasePackets.id, claimed.packetId));
  if (!lease) {
    return true;
  }
  const [existing] = await d
    .select({ id: tenantAccess.id })
    .from(tenantAccess)
    .where(
      and(
        eq(tenantAccess.clerkUserId, clerkUserId),
        eq(tenantAccess.propertyId, lease.propertyId)
      )
    );
  // Keep any access the owner already set up, including a revoked one.
  if (existing) {
    return true;
  }
  // Payments the owner shared with this signer's pending invitation carry over.
  const [invitation] = await d
    .select()
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.propertyId, lease.propertyId),
        eq(tenantInvitations.email, claimed.email.trim().toLowerCase()),
        eq(tenantInvitations.status, "pending")
      )
    );
  await grantTenantAccess({
    actor: "lease signing",
    clerkUserId,
    grant: {
      invoiceIds: invitation?.invoiceIds ?? [],
      name: claimed.name,
      propertyId: lease.propertyId,
      scheduleIds: invitation?.scheduleIds ?? [],
    },
    invitationId: invitation?.id,
  });
  return true;
}
