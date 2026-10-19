import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantInvitations } from "@/lib/db/schema";
import { currentEmailBrand } from "@/lib/email-brand";
import { sendLeaseMail } from "@/lib/leases/mail";
import { notRemoved } from "@/lib/management/not-removed";
import { siteUrl } from "@/lib/management/security";
import { tenantClerkClient } from "./client";
import { grantTenantAccess } from "./grants";

/**
 * Creates a Clerk sign-up invitation and emails its link in the app's own
 * branded email (Clerk's default email has no Back Acres branding). If our
 * email is not accepted, the Clerk invitation is revoked so nothing dangles.
 */
export async function sendClerkInvitation({
  email,
  name,
  propertyName,
}: {
  email: string;
  name: string;
  propertyName: string;
}) {
  const client = await tenantClerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress: email,
    ignoreExisting: true,
    notify: false,
    redirectUrl: new URL("/sign-up", siteUrl()).toString(),
  });
  if (!invitation.url) {
    await revokeClerkInvitation(invitation.id);
    throw new Error("Clerk did not return an invitation link.");
  }
  const brand = await currentEmailBrand();
  const intro = `Hello ${name},\n\n${brand.name} invited you to the tenant portal for ${propertyName}. Create your account with this email address to see your lease, payments, renters insurance, and maintenance requests.`;
  const closing = `This invitation is for ${email}. If you did not expect it, you can ignore this email.`;
  const response = await sendLeaseMail({
    action: { label: "Create your account", url: invitation.url },
    brand,
    htmlAfter: closing,
    htmlText: intro,
    subject: `${brand.name}: your tenant portal invitation`,
    text: `${intro}\n\nCreate your account:\n${invitation.url}\n\n${closing}`,
    to: email,
  });
  if (!response.ok) {
    console.error(
      "Tenant invitation email rejected by Resend",
      response.status,
      invitation.id
    );
    await revokeClerkInvitation(invitation.id);
    throw new Error("The invitation email was not accepted.");
  }
  // Clerk does not email (notify: false); match this id in the Resend log.
  const { id: resendId } = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { id?: string };
  console.info(
    "Tenant invitation email accepted by Resend",
    resendId ?? "unknown-id",
    invitation.id
  );
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
