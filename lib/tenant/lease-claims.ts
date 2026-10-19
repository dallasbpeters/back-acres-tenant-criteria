import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  leaseDrafts,
  leasePackets,
  leaseSigners,
  tenantAccess,
  tenantInvitations,
} from "@/lib/db/schema";
import { shareLeaseDeposits } from "@/lib/leases/deposits";
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
  await grantForSigner(clerkUserId, claimed);
  await shareLeaseDeposits(claimed.packetId, {
    clerkUserId,
    email: claimed.email,
  });
  return true;
}

/** Gives an account access to the property of a lease it signs on. */
async function grantForSigner(
  clerkUserId: string,
  claimed: { email: string | null; name: string; packetId: string }
) {
  const d = db();
  const [lease] = await d
    .select({ propertyId: leaseDrafts.propertyId })
    .from(leasePackets)
    .innerJoin(leaseDrafts, eq(leasePackets.draftId, leaseDrafts.id))
    .where(eq(leasePackets.id, claimed.packetId));
  if (!lease) {
    return;
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
    return;
  }
  // Payments the owner shared with this signer's pending invitation carry over.
  const [invitation] = claimed.email
    ? await d
        .select()
        .from(tenantInvitations)
        .where(
          and(
            eq(tenantInvitations.propertyId, lease.propertyId),
            eq(tenantInvitations.email, claimed.email.trim().toLowerCase()),
            eq(tenantInvitations.status, "pending")
          )
        )
    : [];
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
}

/**
 * Attaches every unclaimed tenant signer whose mobile number matches one of
 * the account's verified phone numbers, then grants property access. Runs
 * when the tenant opens the portal, so the order of account and lease does
 * not matter.
 */
export async function claimLeaseSignersByPhone(
  clerkUserId: string,
  phones: string[]
) {
  if (!phones.length) {
    return 0;
  }
  const claimed = await db()
    .update(leaseSigners)
    .set({ clerkUserId })
    .where(
      and(
        inArray(leaseSigners.phone, phones),
        isNull(leaseSigners.clerkUserId),
        eq(leaseSigners.role, "tenant")
      )
    )
    .returning({
      email: leaseSigners.email,
      name: leaseSigners.name,
      packetId: leaseSigners.packetId,
    });
  for (const signer of claimed) {
    // biome-ignore lint/performance/noAwaitInLoops: Grants for one account share rows; run them in order.
    await grantForSigner(clerkUserId, signer);
    await shareLeaseDeposits(signer.packetId, {
      clerkUserId,
      email: signer.email,
    });
  }
  return claimed.length;
}

/**
 * Records the account on tenant signers it matches by verified email, so the
 * lease stays in this portal if the account's email changes later.
 */
export async function claimLeaseSignersByEmail(
  clerkUserId: string,
  emails: string[]
) {
  if (!emails.length) {
    return 0;
  }
  const claimed = await db()
    .update(leaseSigners)
    .set({ clerkUserId })
    .where(
      and(
        inArray(sql`lower(${leaseSigners.email})`, emails),
        isNull(leaseSigners.clerkUserId),
        eq(leaseSigners.role, "tenant")
      )
    )
    .returning({ email: leaseSigners.email, packetId: leaseSigners.packetId });
  for (const signer of claimed) {
    // biome-ignore lint/performance/noAwaitInLoops: Updates share this account's access rows; run them in order.
    await shareLeaseDeposits(signer.packetId, {
      clerkUserId,
      email: signer.email,
    });
  }
  return claimed.length;
}
