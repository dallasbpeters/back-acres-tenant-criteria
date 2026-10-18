import "server-only";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantAccess } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { tenantAuthReady } from "./config";

export async function tenantIdentity() {
  if (!tenantAuthReady()) {
    return null;
  }
  const session = await auth();
  return session.isAuthenticated ? session.userId : null;
}
export function assignments(userId: string) {
  return db()
    .select()
    .from(tenantAccess)
    .where(
      and(
        eq(tenantAccess.clerkUserId, userId),
        isNull(tenantAccess.revokedAt),
        notRemoved(tenantAccess.propertyId),
        notRemoved(tenantAccess.id)
      )
    );
}
export async function assignment(userId: string, id: string) {
  const rows = await db()
    .select()
    .from(tenantAccess)
    .where(
      and(
        eq(tenantAccess.id, id),
        eq(tenantAccess.clerkUserId, userId),
        isNull(tenantAccess.revokedAt),
        notRemoved(tenantAccess.propertyId),
        notRemoved(tenantAccess.id)
      )
    );
  return rows[0] ?? null;
}
