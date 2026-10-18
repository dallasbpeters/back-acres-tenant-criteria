import { notRemoved } from "@/lib/management/not-removed";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { guard, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { leaseDrafts } from "@/lib/db/schema";
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
      .where(and(eq(leaseDrafts.id, id), notRemoved(leaseDrafts.id)));
    if (!draft) return reply({ error: "Not found." }, 404);
    const bytes = await leasePdf(draft.body, id, draft.document);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lease-draft-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return reply({ error: "Could not generate PDF." }, 503);
  }
}
