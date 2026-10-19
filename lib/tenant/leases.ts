import "server-only";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaseDrafts, leasePackets, leaseSigners } from "@/lib/db/schema";
import { completePacket } from "@/lib/leases/signing-store";
import { notRemoved } from "@/lib/management/not-removed";

export interface TenantLease {
  createdAt: Date;
  id: string;
  /** When this tenant signed, or null while their signature is outstanding. */
  mySignedAt: Date | null;
  signed: number;
  signers: number;
  status: "awaiting" | "completed";
  tenantName: string;
}

/** Verified addresses only: an unverified email never unlocks a lease. */
export function verifiedEmails(
  user: {
    emailAddresses: {
      emailAddress: string;
      verification: { status: string } | null;
    }[];
  } | null
) {
  return (user?.emailAddresses ?? [])
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.trim().toLowerCase());
}

/** How the signed-in tenant identifies themself: phone, email or username. */
export function accountLabel(
  user: {
    primaryEmailAddress?: { emailAddress: string } | null;
    primaryPhoneNumber?: { phoneNumber: string } | null;
    username?: string | null;
  } | null
) {
  return (
    user?.primaryPhoneNumber?.phoneNumber ??
    user?.primaryEmailAddress?.emailAddress ??
    user?.username ??
    ""
  );
}

/** Verified phone numbers, in the +1XXXXXXXXXX form signers are stored in. */
export function verifiedPhones(
  user: {
    phoneNumbers?: {
      phoneNumber: string;
      verification: { status: string } | null;
    }[];
  } | null
) {
  return (user?.phoneNumbers ?? [])
    .filter((number) => number.verification?.status === "verified")
    .map((number) => number.phoneNumber.replace(/[^\d+]/g, ""));
}

/**
 * Lease packets for one owner-assigned property where the tenant is a signer.
 * Both conditions are required: property access comes from the owner's
 * assignment, and signer membership comes from the tenant's verified email
 * or from an account that claimed the signer through its signing link.
 */
export async function tenantLeases(
  propertyId: string,
  emails: string[],
  /** A portal account that claimed a signer from its signing link. */
  clerkUserId?: string
): Promise<TenantLease[]> {
  const mineBy = [
    ...(emails.length
      ? [inArray(sql`lower(${leaseSigners.email})`, emails)]
      : []),
    ...(clerkUserId ? [eq(leaseSigners.clerkUserId, clerkUserId)] : []),
  ];
  if (!mineBy.length) {
    return [];
  }
  const d = db();
  const mine = await d
    .select({
      createdAt: leasePackets.createdAt,
      id: leasePackets.id,
      mySignedAt: leaseSigners.signedAt,
      status: leasePackets.status,
      tenantName: leaseDrafts.tenantName,
    })
    .from(leaseSigners)
    .innerJoin(leasePackets, eq(leaseSigners.packetId, leasePackets.id))
    .innerJoin(leaseDrafts, eq(leasePackets.draftId, leaseDrafts.id))
    .where(
      and(
        eq(leaseDrafts.propertyId, propertyId),
        or(...mineBy),
        ne(leasePackets.status, "voided"),
        notRemoved(leaseDrafts.id),
        notRemoved(leaseDrafts.propertyId)
      )
    )
    .orderBy(desc(leasePackets.createdAt));
  if (!mine.length) {
    return [];
  }
  const counts = await d
    .select({
      packetId: leaseSigners.packetId,
      signed: sql<number>`count(${leaseSigners.signedAt})::int`,
      signers: sql<number>`count(*)::int`,
    })
    .from(leaseSigners)
    .where(
      inArray(
        leaseSigners.packetId,
        mine.map((row) => row.id)
      )
    )
    .groupBy(leaseSigners.packetId);
  // Packets finalize lazily; finish any where every signer is done.
  const results = await Promise.all(
    counts
      .filter((count) => count.signers && count.signed === count.signers)
      .map(async (count) => {
        const row = mine.find((item) => item.id === count.packetId);
        const packet =
          row?.status === "completed"
            ? row
            : await completePacket(count.packetId);
        return packet?.status === "completed" ? count.packetId : null;
      })
  );
  const finished = new Set(results.filter(Boolean));
  const seen = new Set<string>();
  return mine.flatMap((row) => {
    // One tenant may hold two signer rows (for example, two verified emails).
    if (seen.has(row.id)) {
      return [];
    }
    seen.add(row.id);
    const count = counts.find((item) => item.packetId === row.id);
    return [
      {
        ...row,
        signed: count?.signed ?? 0,
        signers: count?.signers ?? 0,
        status: finished.has(row.id) ? "completed" : "awaiting",
      },
    ];
  });
}
