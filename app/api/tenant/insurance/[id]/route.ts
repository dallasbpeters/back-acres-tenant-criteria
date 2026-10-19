import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { insuranceDocuments, tenantAccess } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { tenantIdentity } from "@/lib/tenant/access";
import { insuranceFileResponse } from "@/lib/tenant/insurance-files";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return reply({ error: "Not found." }, 404);
  }
  try {
    const userId = await tenantIdentity();
    if (!userId) {
      return reply({ error: "Please sign in." }, 401);
    }
    // Only the account that holds the active tenancy can read its uploads.
    const [row] = await db()
      .select({ document: insuranceDocuments })
      .from(insuranceDocuments)
      .innerJoin(
        tenantAccess,
        eq(insuranceDocuments.tenantAccessId, tenantAccess.id)
      )
      .where(
        and(
          eq(insuranceDocuments.id, id),
          eq(tenantAccess.clerkUserId, userId),
          isNull(tenantAccess.revokedAt),
          notRemoved(tenantAccess.id),
          notRemoved(tenantAccess.propertyId)
        )
      );
    if (!row) {
      return reply({ error: "Not found." }, 404);
    }
    return await insuranceFileResponse(row.document);
  } catch {
    return reply({ error: "This document is unavailable." }, 503);
  }
}
