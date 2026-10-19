const pattern1 = /^[a-f0-9]{64}$/;

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaseDrafts, leasePackets, leaseSigners } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { signaturePdf } from "./signature-pdf";
import { digest } from "./signing-model";
export async function activePacket(id: string) {
  const [packet] = await db()
    .select({ packet: leasePackets })
    .from(leasePackets)
    .innerJoin(leaseDrafts, eq(leasePackets.draftId, leaseDrafts.id))
    .where(
      and(
        eq(leasePackets.id, id),
        notRemoved(leaseDrafts.id),
        notRemoved(leaseDrafts.propertyId)
      )
    );
  return packet?.packet ?? null;
}
export async function tokenSigner(token: string) {
  if (!pattern1.test(token)) {
    return null;
  }
  const [signer] = await db()
    .select()
    .from(leaseSigners)
    .where(eq(leaseSigners.tokenHash, digest(token)));
  if (!signer) {
    return null;
  }
  const packet = await activePacket(signer.packetId);
  if (
    !packet ||
    packet.status === "voided" ||
    (packet.expiresAt < new Date() && packet.status !== "completed")
  ) {
    return null;
  }
  return { packet, signer };
}
export async function completePacket(id: string) {
  const packet = await activePacket(id);
  if (!packet) {
    return null;
  }
  if (packet.finalPdf || packet.status === "voided") {
    return packet;
  }
  const signers = await db()
    .select()
    .from(leaseSigners)
    .where(eq(leaseSigners.packetId, id))
    .orderBy(leaseSigners.id);
  if (!signers.length || signers.some((s) => !s.signedAt)) {
    return packet;
  }
  const bytes = await signaturePdf(packet, signers, true),
    hash = digest(bytes);
  await db()
    .update(leasePackets)
    .set({
      finalHash: hash,
      finalPdf: Buffer.from(bytes).toString("base64"),
      status: "completed",
    })
    .where(
      and(
        eq(leasePackets.id, id),
        eq(leasePackets.status, "awaiting"),
        sql`not exists(select 1 from ${leaseSigners} where ${leaseSigners.packetId}=${id} and ${leaseSigners.signedAt} is null)`
      )
    );
  return activePacket(id);
}
/**
 * The PDF to hand out now: the final signed copy, a copy with the signatures
 * recorded so far, or the untouched lease when nobody has signed yet.
 */
export async function currentLeasePdf(
  packet: typeof leasePackets.$inferSelect
) {
  if (packet.finalPdf) {
    return Buffer.from(packet.finalPdf, "base64");
  }
  const signers = await db()
    .select()
    .from(leaseSigners)
    .where(eq(leaseSigners.packetId, packet.id));
  if (!signers.some((s) => s.signedAt)) {
    return Buffer.from(packet.basePdf, "base64");
  }
  return Buffer.from(await signaturePdf(packet, signers, false));
}
