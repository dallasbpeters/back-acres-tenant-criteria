import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { authOptions } from "@/lib/adverse/google-auth";
import { db } from "@/lib/db";
import { insuranceDocuments, properties, tenantAccess } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import {
  insuranceReviewSchema,
  insuranceStanding,
} from "@/lib/tenant/insurance";

export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  try {
    const rows = await db()
      .select({
        document: insuranceDocuments,
        property: properties.data,
        tenant: tenantAccess.name,
      })
      .from(insuranceDocuments)
      .innerJoin(
        tenantAccess,
        eq(insuranceDocuments.tenantAccessId, tenantAccess.id)
      )
      .innerJoin(properties, eq(insuranceDocuments.propertyId, properties.id))
      .where(notRemoved(insuranceDocuments.propertyId))
      .orderBy(desc(insuranceDocuments.createdAt))
      .limit(200);
    return reply({
      documents: rows.map(({ document, property, tenant }) => ({
        carrier: document.carrier,
        createdAt: document.createdAt,
        endsOn: document.endsOn,
        fileName: document.fileName,
        id: document.id,
        policyNumber: document.policyNumber,
        propertyName: property.name,
        reviewedAt: document.reviewedAt,
        reviewNote: document.reviewNote,
        standing: insuranceStanding(document.startsOn, document.endsOn),
        startsOn: document.startsOn,
        status: document.status,
        tenantAccessId: document.tenantAccessId,
        tenantName: tenant,
      })),
    });
  } catch {
    return reply({ error: "Insurance documents are unavailable." }, 503);
  }
}

export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  try {
    const parsed = insuranceReviewSchema.safeParse(
      await readBody(request).catch(() => null)
    );
    if (!parsed.success) {
      return reply({ error: "Choose accepted or needs a new copy." }, 400);
    }
    if (parsed.data.status === "rejected" && !parsed.data.note) {
      return reply(
        { error: "Tell the renter what to fix before asking for a new copy." },
        400
      );
    }
    const session = await getServerSession(authOptions);
    const updated = await db()
      .update(insuranceDocuments)
      .set({
        reviewedAt: new Date(),
        reviewedBy: session?.user?.email ?? "owner",
        reviewNote: parsed.data.note,
        status: parsed.data.status,
      })
      .where(eq(insuranceDocuments.id, parsed.data.id))
      .returning({ id: insuranceDocuments.id });
    if (!updated.length) {
      return reply({ error: "Document not found." }, 404);
    }
    return reply({ ok: true });
  } catch {
    return reply({ error: "Could not save the review." }, 503);
  }
}
