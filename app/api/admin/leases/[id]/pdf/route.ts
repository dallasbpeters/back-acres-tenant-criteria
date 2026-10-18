import { notRemoved } from "@/lib/management/not-removed";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc, ne } from "drizzle-orm";
import { guard, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { leaseDrafts, brandVersions, leasePackets } from "@/lib/db/schema";
import { completePacket } from "@/lib/leases/signing-store";
import { leasePdf } from "@/lib/leases/pdf";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return reply({ error: "Not found." }, 404);
  try {
    const [draft] = await db()
      .select()
      .from(leaseDrafts)
      .where(
        and(
          eq(leaseDrafts.id, id),
          notRemoved(leaseDrafts.id),
          notRemoved(leaseDrafts.propertyId),
        ),
      );
    if (!draft) return reply({ error: "Not found." }, 404);
    const [candidate] = await db()
      .select()
      .from(leasePackets)
      .where(
        and(eq(leasePackets.draftId, id), ne(leasePackets.status, "voided")),
      );
    const packet = candidate ? await completePacket(candidate.id) : null;
    const [brand] = await db()
      .select()
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
      .limit(1);
    const bytes = packet?.finalPdf
      ? Buffer.from(packet.finalPdf, "base64")
      : packet
        ? Buffer.from(packet.basePdf, "base64")
        : await leasePdf(draft.body, id, draft.document, {
            name: brand?.name ?? "Back Acres Rental",
            logoPng: brand?.logoPng ?? null,
          });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lease-${packet?.finalPdf ? "signed" : packet ? "for-signature" : "draft"}-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return reply({ error: "Could not generate PDF." }, 503);
  }
}
