import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { guard, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { insuranceDocuments } from "@/lib/db/schema";
import { insuranceFileResponse } from "@/lib/tenant/insurance-files";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return reply({ error: "Not found." }, 404);
  }
  try {
    const [document] = await db()
      .select()
      .from(insuranceDocuments)
      .where(eq(insuranceDocuments.id, id));
    if (!document) {
      return reply({ error: "Not found." }, 404);
    }
    return await insuranceFileResponse(document);
  } catch {
    return reply({ error: "This document is unavailable." }, 503);
  }
}
