import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { guard, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { leaseDrafts, tenantAccess, tenantInvitations } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { tenantClerkClient } from "@/lib/tenant/client";
import { tenantAuthReady } from "@/lib/tenant/config";

export interface Renter {
  email: string;
  name: string;
  /** "account": a connected portal account; "invited": a pending invitation. */
  source: "account" | "invited";
}

/**
 * Renters connected to a lease's property, for choosing lease signers, or
 * (with ?email=) whether any portal account owns an email address.
 */
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const params = request.nextUrl.searchParams;
  try {
    if (!tenantAuthReady()) {
      return reply({ ready: false, renters: [] });
    }
    const client = await tenantClerkClient();
    const email = params.get("email");
    if (email !== null) {
      const parsed = z.string().trim().toLowerCase().email().safeParse(email);
      if (!parsed.success) {
        return reply({ hasAccount: false, valid: false });
      }
      const { data } = await client.users.getUserList({
        emailAddress: [parsed.data],
        limit: 10,
      });
      const hasAccount = data.some((user) =>
        user.emailAddresses.some(
          (address) =>
            address.emailAddress.toLowerCase() === parsed.data &&
            address.verification?.status === "verified"
        )
      );
      return reply({ hasAccount, valid: true });
    }
    const draftId = z.string().uuid().safeParse(params.get("draftId"));
    if (!draftId.success) {
      return reply({ error: "Choose a lease." }, 400);
    }
    const d = db();
    const [draft] = await d
      .select({ propertyId: leaseDrafts.propertyId })
      .from(leaseDrafts)
      .where(and(eq(leaseDrafts.id, draftId.data), notRemoved(leaseDrafts.id)));
    if (!draft) {
      return reply({ error: "Lease not found." }, 404);
    }
    const [access, invitations] = await Promise.all([
      d
        .select({
          clerkUserId: tenantAccess.clerkUserId,
          name: tenantAccess.name,
        })
        .from(tenantAccess)
        .where(
          and(
            eq(tenantAccess.propertyId, draft.propertyId),
            isNull(tenantAccess.revokedAt),
            notRemoved(tenantAccess.id)
          )
        ),
      d
        .select({
          email: tenantInvitations.email,
          name: tenantInvitations.name,
        })
        .from(tenantInvitations)
        .where(
          and(
            eq(tenantInvitations.propertyId, draft.propertyId),
            eq(tenantInvitations.status, "pending")
          )
        ),
    ]);
    const users = access.length
      ? (
          await client.users.getUserList({
            limit: 100,
            userId: access.map((row) => row.clerkUserId),
          })
        ).data
      : [];
    const renters: Renter[] = [];
    for (const row of access) {
      const user = users.find((u) => u.id === row.clerkUserId);
      const primary =
        user?.emailAddresses.find((a) => a.id === user.primaryEmailAddressId) ??
        user?.emailAddresses[0];
      if (primary?.verification?.status === "verified") {
        renters.push({
          email: primary.emailAddress.toLowerCase(),
          name: row.name,
          source: "account",
        });
      }
    }
    for (const invitation of invitations) {
      if (!renters.some((r) => r.email === invitation.email)) {
        renters.push({ ...invitation, source: "invited" });
      }
    }
    return reply({ ready: true, renters });
  } catch (error) {
    console.error(
      "Renter lookup failed",
      error instanceof Error ? error.message : String(error)
    );
    return reply({ error: "Could not load renters." }, 503);
  }
}
