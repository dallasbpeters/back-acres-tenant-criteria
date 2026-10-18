import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { authOptions } from "@/lib/adverse/google-auth";
import { db } from "@/lib/db";
import {
  invoices,
  managementEvents,
  properties,
  rentSchedules,
  residentLinks,
  tenantAccess,
} from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { tenantClerkClient } from "@/lib/tenant/client";
import { tenantAuthReady } from "@/lib/tenant/config";
import { tenantAssignmentSchema, verifiedAccountId } from "@/lib/tenant/model";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), data: tenantAssignmentSchema }),
  z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
]);
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  try {
    return reply({
      assignments: await db()
        .select()
        .from(tenantAccess)
        .orderBy(tenantAccess.createdAt),
      ready: tenantAuthReady(),
    });
  } catch {
    return reply({ error: "Could not load tenant access." }, 503);
  }
}
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const parsed = input.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) {
    return reply(
      { error: "Check the tenant, property, and shared records." },
      400
    );
  }
  const command = parsed.data;
  try {
    const d = db();
    const actor = (await getServerSession(authOptions))?.user?.email ?? "owner";
    if (command.action === "revoke") {
      const [revoked] = await d
        .select()
        .from(tenantAccess)
        .where(eq(tenantAccess.id, command.id));
      if (!revoked) {
        return reply({ error: "Tenant access not found." }, 404);
      }
      await d.batch([
        d
          .update(tenantAccess)
          .set({ revokedAt: new Date() })
          .where(eq(tenantAccess.id, command.id)),
        d
          .update(residentLinks)
          .set({ revoked: true })
          .where(eq(residentLinks.id, revoked.residentLinkId)),
        d.insert(managementEvents).values({
          action: "revokeTenantAccess",
          actor,
          detail: {},
          entityId: revoked.id,
          id: randomUUID(),
        }),
      ]);
      return reply({ ok: true });
    }
    if (!tenantAuthReady()) {
      return reply(
        { error: "Configure Clerk before assigning tenant access." },
        503
      );
    }
    const { data } = command;
    const [property] = await d
      .select()
      .from(properties)
      .where(
        and(eq(properties.id, data.propertyId), notRemoved(properties.id))
      );
    if (!property) {
      return reply({ error: "Property not found." }, 404);
    }
    const client = await tenantClerkClient();
    const result = await client.users.getUserList({
      emailAddress: [data.email],
      limit: 100,
    });
    const clerkUserId = verifiedAccountId(result.data, data.email);
    if (!clerkUserId) {
      return reply(
        {
          error:
            "Ask the tenant to create an account and verify this email first.",
        },
        409
      );
    }
    const [invoiceRows, scheduleRows] = await Promise.all([
      data.invoiceIds.length
        ? d
            .select({ id: invoices.id })
            .from(invoices)
            .where(
              and(
                eq(invoices.propertyId, data.propertyId),
                inArray(invoices.id, data.invoiceIds),
                notRemoved(invoices.id)
              )
            )
        : [],
      data.scheduleIds.length
        ? d
            .select({ id: rentSchedules.id })
            .from(rentSchedules)
            .where(
              and(
                eq(rentSchedules.propertyId, data.propertyId),
                inArray(rentSchedules.id, data.scheduleIds),
                notRemoved(rentSchedules.id)
              )
            )
        : [],
    ]);
    if (
      invoiceRows.length !== new Set(data.invoiceIds).size ||
      scheduleRows.length !== new Set(data.scheduleIds).size
    ) {
      return reply(
        {
          error:
            "A selected payment belongs to another property or was removed.",
        },
        400
      );
    }
    const [existing] = await d
      .select()
      .from(tenantAccess)
      .where(
        and(
          eq(tenantAccess.clerkUserId, clerkUserId),
          eq(tenantAccess.propertyId, data.propertyId)
        )
      );
    const id = existing?.id ?? randomUUID();
    const linkId = existing?.residentLinkId ?? randomUUID();
    const expiresAt = new Date(Date.now() + 365 * 86_400_000);
    // One database transaction creates the internal maintenance identity and explicit grants together.
    await d.batch([
      d
        .insert(residentLinks)
        .values({
          expiresAt,
          id: linkId,
          propertyId: data.propertyId,
          residentName: data.name,
        })
        .onConflictDoUpdate({
          set: { expiresAt, revoked: false },
          target: residentLinks.id,
        }),
      d
        .insert(tenantAccess)
        .values({
          clerkUserId,
          id,
          invoiceIds: data.invoiceIds,
          name: data.name,
          propertyId: data.propertyId,
          residentLinkId: linkId,
          scheduleIds: data.scheduleIds,
        })
        .onConflictDoUpdate({
          set: {
            invoiceIds: data.invoiceIds,
            name: data.name,
            revokedAt: null,
            scheduleIds: data.scheduleIds,
          },
          target: [tenantAccess.propertyId, tenantAccess.clerkUserId],
        }),
      d.insert(managementEvents).values({
        action: "assignTenantAccess",
        actor,
        detail: {
          invoiceIds: data.invoiceIds,
          propertyId: data.propertyId,
          scheduleIds: data.scheduleIds,
        },
        entityId: id,
        id: randomUUID(),
      }),
    ]);
    return reply({ ok: true });
  } catch {
    return reply(
      { error: "Could not update access. Reload and try again." },
      503
    );
  }
}
