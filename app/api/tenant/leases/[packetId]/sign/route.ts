import { randomBytes } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { reply, sameOrigin } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { leaseSigners } from "@/lib/db/schema";
import { digest } from "@/lib/leases/signing-model";
import { activePacket } from "@/lib/leases/signing-store";
import { assignments, tenantIdentity } from "@/lib/tenant/access";
import { tenantLeases, verifiedEmails } from "@/lib/tenant/leases";

const packetPattern = /^[0-9a-f-]{36}$/;

/**
 * Opens signing from the tenant portal. The signed-in account's verified
 * email must match a signer on this lease. The signer gets a new private
 * link, so an older emailed link stops working.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packetId: string }> }
) {
  if (!sameOrigin(request)) {
    return reply({ error: "Invalid origin." }, 403);
  }
  const { packetId } = await params;
  if (!packetPattern.test(packetId)) {
    return reply({ error: "Not found." }, 404);
  }
  try {
    const userId = await tenantIdentity();
    if (!userId) {
      return reply({ error: "Please sign in." }, 401);
    }
    const emails = verifiedEmails(await currentUser());
    const access = await assignments(userId);
    // Authorize through the same property + signer query the portal lists.
    const visible = await Promise.all(
      access.map((row) => tenantLeases(row.propertyId, emails))
    );
    if (!visible.flat().some((lease) => lease.id === packetId)) {
      return reply({ error: "Not found." }, 404);
    }
    const packet = await activePacket(packetId);
    if (packet?.status !== "awaiting" || packet.expiresAt < new Date()) {
      return reply({ error: "This lease is no longer open for signing." }, 409);
    }
    const token = randomBytes(32).toString("hex");
    const [updated] = await db()
      .update(leaseSigners)
      .set({ sessionHash: null, tokenHash: digest(token) })
      .where(
        and(
          eq(leaseSigners.packetId, packetId),
          inArray(sql`lower(${leaseSigners.email})`, emails),
          isNull(leaseSigners.signedAt),
          isNull(leaseSigners.declinedAt)
        )
      )
      .returning({ id: leaseSigners.id });
    if (!updated) {
      return reply({ error: "You already signed this lease." }, 409);
    }
    return NextResponse.json(
      { url: `/sign/lease/${token}` },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error(
      "Portal lease signing failed",
      error instanceof Error ? error.message : String(error)
    );
    return reply({ error: "Could not open this lease. Try again." }, 503);
  }
}
