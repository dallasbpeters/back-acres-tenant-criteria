import { PDFDocument } from "pdf-lib";
import { notRemoved } from "@/lib/management/not-removed";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc, ne } from "drizzle-orm";
import { guard, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import {
  leaseDrafts,
  brandVersions,
  leasePackets,
  leaseSigners,
} from "@/lib/db/schema";
import { completePacket } from "@/lib/leases/signing-store";
import { signaturePdf } from "@/lib/leases/signature-pdf";
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
    const preview = request.nextUrl.searchParams.get("preview") === "1";
    const signers =
      preview && packet
        ? await db()
            .select()
            .from(leaseSigners)
            .where(eq(leaseSigners.packetId, packet.id))
            .orderBy(leaseSigners.id)
        : [];
    const partial = signers.some((s) => s.signedAt);
    const bytes = packet?.finalPdf
      ? Buffer.from(packet.finalPdf, "base64")
      : preview && packet && partial
        ? await signaturePdf(packet, signers, false)
        : packet
          ? Buffer.from(packet.basePdf, "base64")
          : await leasePdf(draft.body, id, draft.document, {
              name: brand?.name ?? "Back Acres Rental",
              logoPng: brand?.logoPng ?? null,
            });
    const signaturePage =
      preview && packet && partial
        ? (
            await PDFDocument.load(Buffer.from(packet.basePdf, "base64"))
          ).getPageCount() + 1
        : 0;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "X-Lease-Signature-Page": String(signaturePage),
        "Content-Disposition": `attachment; filename="lease-${packet?.finalPdf ? "signed" : partial ? "in-progress" : packet ? "for-signature" : "draft"}-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return reply({ error: "Could not generate PDF." }, 503);
  }
}
