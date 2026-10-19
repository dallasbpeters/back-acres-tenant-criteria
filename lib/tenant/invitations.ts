import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantInvitations } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { siteUrl } from "@/lib/management/security";
import { tenantClerkClient } from "./client";
import { grantTenantAccess } from "./grants";

/** Emails a Clerk sign-up invitation that returns the tenant to this site. */
export async function sendClerkInvitation(email: string) {
  const client = await tenantClerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress: email,
    ignoreExisting: true,
    notify: true,
    redirectUrl: new URL("/sign-up", siteUrl()).toString(),
  });
  return invitation.id;
}

export async function revokeClerkInvitation(invitationId: string | null) {
  if (!invitationId) {
    return;
  }
  const client = await tenantClerkClient();
  await client.invitations.revokeInvitation(invitationId).catch(() => {
    // Already accepted, expired or revoked in Clerk: the local row still closes.
  });
}

/**
 * Applies pending owner invitations to a signed-in tenant. Only verified email
 * addresses match, the same rule the owner's direct assignment uses.
 */
export async function claimTenantInvitations(
  clerkUserId: string,
  emails: string[]
) {
  if (!emails.length) {
    return 0;
  }
  const pending = await db()
    .select()
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.status, "pending"),
        inArray(tenantInvitations.email, emails),
        notRemoved(tenantInvitations.propertyId)
      )
    );
  for (const invitation of pending) {
    // biome-ignore lint/performance/noAwaitInLoops: Each grant is its own transaction; sequential runs keep a property's grant and audit order stable.
    await grantTenantAccess({
      actor: `invitation:${invitation.actor}`,
      clerkUserId,
      grant: invitation,
      invitationId: invitation.id,
    });
  }
  return pending.length;
}
