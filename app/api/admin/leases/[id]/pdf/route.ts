const pattern1 = /^[0-9a-f-]{36}$/;

import { and, desc, eq, ne } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { guard, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import {
  brandVersions,
  leaseDrafts,
  leasePackets,
  leaseSigners,
} from "@/lib/db/schema";
import { leasePdf } from "@/lib/leases/pdf";
import { signaturePdf } from "@/lib/leases/signature-pdf";
import { completePacket } from "@/lib/leases/signing-store";
import { notRemoved } from "@/lib/management/not-removed";
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const { id } = await params;
  if (!pattern1.test(id)) {
    return reply({ error: "Not found." }, 404);
  }
  try {
    const [draft] = await db()
      .select()
      .from(leaseDrafts)
      .where(
        and(
          eq(leaseDrafts.id, id),
          notRemoved(leaseDrafts.id),
          notRemoved(leaseDrafts.propertyId)
        )
      );
    if (!draft) {
      return reply({ error: "Not found." }, 404);
    }
    const [candidate] = await db()
      .select()
      .from(leasePackets)
      .where(
        and(eq(leasePackets.draftId, id), ne(leasePackets.status, "voided"))
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
    const resolveBytes1 = async () => {
      if (packet?.finalPdf) {
        return Buffer.from(packet.finalPdf, "base64");
      }
      if (preview && packet && partial) {
        return await signaturePdf(packet, signers, false);
      }
      if (packet) {
        return Buffer.from(packet.basePdf, "base64");
      }
      return await leasePdf(draft.body, id, draft.document, {
        logoPng: brand?.logoPng ?? null,
        name: brand?.name ?? "Back Acres Rental",
      });
    };
    const bytes = await resolveBytes1();
    const signaturePage =
      preview && packet && partial
        ? (
            await PDFDocument.load(Buffer.from(packet.basePdf, "base64"))
          ).getPageCount() + 1
        : 0;
    const resolveResult2 = () => {
      if (packet?.finalPdf) {
        return "signed";
      }
      if (partial) {
        return "in-progress";
      }
      if (packet) {
        return "for-signature";
      }
      return "draft";
    };
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="lease-${resolveResult2()}-${id}.pdf"`,
        "Content-Type": "application/pdf",
        "X-Lease-Signature-Page": String(signaturePage),
      },
    });
  } catch {
    return reply({ error: "Could not generate PDF." }, 503);
  }
}
