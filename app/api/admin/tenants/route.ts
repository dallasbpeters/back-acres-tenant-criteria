import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
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
  tenantInvitations,
} from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { tenantClerkClient } from "@/lib/tenant/client";
import { tenantAuthReady } from "@/lib/tenant/config";
import { grantTenantAccess } from "@/lib/tenant/grants";
import {
  revokeClerkInvitation,
  sendClerkInvitation,
} from "@/lib/tenant/invitations";
import { tenantAssignmentSchema, verifiedAccountId } from "@/lib/tenant/model";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), data: tenantAssignmentSchema }),
  z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
  z.object({ action: z.literal("resendInvite"), id: z.string().uuid() }),
  z.object({ action: z.literal("cancelInvite"), id: z.string().uuid() }),
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
      invitations: await db()
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.status, "pending"))
        .orderBy(desc(tenantInvitations.createdAt)),
      ready: tenantAuthReady(),
    });
  } catch {
    return reply({ error: "Could not load tenant access." }, 503);
  }
}
type Command = z.infer<typeof input>;
type Database = ReturnType<typeof db>;

async function revokeAccess(
  d: Database,
  command: Extract<Command, { action: "revoke" }>,
  actor: string
) {
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

async function updateInvitation(
  d: Database,
  command: Extract<Command, { action: "resendInvite" | "cancelInvite" }>
) {
  const [invitation] = await d
    .select()
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.id, command.id),
        eq(tenantInvitations.status, "pending")
      )
    );
  if (!invitation) {
    return reply({ error: "Invitation not found." }, 404);
  }
  await revokeClerkInvitation(invitation.clerkInvitationId);
  const clerkInvitationId =
    command.action === "resendInvite"
      ? await sendClerkInvitation(invitation.email)
      : invitation.clerkInvitationId;
  await d
    .update(tenantInvitations)
    .set(
      command.action === "resendInvite"
        ? { clerkInvitationId }
        : { status: "canceled" }
    )
    .where(eq(tenantInvitations.id, invitation.id));
  return reply({ ok: true });
}

async function assignAccess(
  d: Database,
  command: Extract<Command, { action: "assign" }>,
  actor: string
) {
  const { data } = command;
  const [property] = await d
    .select()
    .from(properties)
    .where(and(eq(properties.id, data.propertyId), notRemoved(properties.id)));
  if (!property) {
    return reply({ error: "Property not found." }, 404);
  }
  const client = await tenantClerkClient();
  const result = await client.users.getUserList({
    emailAddress: [data.email],
    limit: 100,
  });
  const clerkUserId = verifiedAccountId(result.data, data.email);
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
        error: "A selected payment belongs to another property or was removed.",
      },
      400
    );
  }
  const grant = {
    invoiceIds: data.invoiceIds,
    name: data.name,
    propertyId: data.propertyId,
    scheduleIds: data.scheduleIds,
  };
  if (!clerkUserId) {
    // No verified account yet: email a Clerk invitation and keep the grant
    // pending until that email verifies and signs in.
    const clerkInvitationId = await sendClerkInvitation(data.email);
    const [previous] = await d
      .select()
      .from(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.propertyId, data.propertyId),
          eq(tenantInvitations.email, data.email),
          eq(tenantInvitations.status, "pending")
        )
      );
    if (previous) {
      await d
        .update(tenantInvitations)
        .set({ ...grant, actor, clerkInvitationId })
        .where(eq(tenantInvitations.id, previous.id));
    } else {
      await d.insert(tenantInvitations).values({
        ...grant,
        actor,
        clerkInvitationId,
        email: data.email,
        id: randomUUID(),
      });
    }
    return reply({ invited: true, ok: true });
  }
  await grantTenantAccess({ actor, clerkUserId, grant });
  return reply({ ok: true });
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
      return await revokeAccess(d, command, actor);
    }
    if (!tenantAuthReady()) {
      return reply(
        { error: "Configure Clerk before assigning tenant access." },
        503
      );
    }
    if (command.action === "assign") {
      return await assignAccess(d, command, actor);
    }
    return await updateInvitation(d, command);
  } catch {
    return reply(
      { error: "Could not update access. Reload and try again." },
      503
    );
  }
}
