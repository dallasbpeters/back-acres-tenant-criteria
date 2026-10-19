import { currentUser } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { reply } from "@/lib/adverse/auth";
import { completePacket, currentLeasePdf } from "@/lib/leases/signing-store";
import { assignments, tenantIdentity } from "@/lib/tenant/access";
import { tenantLeases, verifiedEmails } from "@/lib/tenant/leases";

const packetPattern = /^[0-9a-f-]{36}$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ packetId: string }> }
) {
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
      access.map((row) => tenantLeases(row.propertyId, emails, userId))
    );
    const allowed = visible.flat().some((lease) => lease.id === packetId);
    if (!allowed) {
      return reply({ error: "Not found." }, 404);
    }
    const packet = await completePacket(packetId);
    if (!packet) {
      return reply({ error: "Not found." }, 404);
    }
    const signed = !!packet.finalPdf;
    return new Response(new Uint8Array(await currentLeasePdf(packet)), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="lease-${signed ? "signed" : "for-signature"}-${packetId}.pdf"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return reply({ error: "Could not load this lease." }, 503);
  }
}
