import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { maintenanceRequests } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";

/**
 * Requests a tenant submitted through their account. Tenant access carries its
 * own internal maintenance identity, created when the owner connects the
 * account, so the owner never has to send the tenant a request link.
 */
export function tenantMaintenanceRequests(residentLinkId: string, limit = 100) {
  return db()
    .select()
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.residentLinkId, residentLinkId),
        notRemoved(maintenanceRequests.id)
      )
    )
    .orderBy(desc(maintenanceRequests.createdAt))
    .limit(limit);
}
