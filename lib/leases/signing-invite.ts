import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { leaseDrafts, leaseSigners } from "@/lib/db/schema";
import { currentEmailBrand } from "@/lib/email-brand";
import { leaseContact } from "@/lib/leases/contact";
import { sendLeaseMail } from "@/lib/leases/mail";
import { digest } from "@/lib/leases/signing-model";
import { activePacket } from "@/lib/leases/signing-store";
import { siteUrl } from "@/lib/management/security";
import { preparePortalForLeaseTenant } from "@/lib/tenant/invitations";

/** Emails one signer a fresh private signing link. */
export async function inviteSigner(signerId: string, actor: string) {
  const d = db();
  const [signer] = await d
    .select()
    .from(leaseSigners)
    .where(eq(leaseSigners.id, signerId));
  if (!signer) {
    return { error: "Signer not found.", status: 404 } as const;
  }
  const packet = await activePacket(signer.packetId);
  if (
    packet?.status !== "awaiting" ||
    packet.expiresAt < new Date() ||
    signer.declinedAt ||
    signer.signedAt
  ) {
    return {
      error: "This signing request is no longer active.",
      status: 409,
    } as const;
  }
  if (!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL)) {
    return {
      error: "Configure Resend before sending signing links.",
      status: 503,
    } as const;
  }
  const token = randomBytes(32).toString("hex"),
    url = `${siteUrl()}/sign/lease/${token}`;
  const updated = await d
    .update(leaseSigners)
    .set({
      codeHash: null,
      sessionHash: null,
      tokenHash: digest(token),
      verifiedAt: null,
    })
    .where(and(eq(leaseSigners.id, signer.id), isNull(leaseSigners.signedAt)))
    .returning({ id: leaseSigners.id });
  if (!updated.length) {
    return { error: "This signer has already signed.", status: 409 } as const;
  }
  const contact = await leaseContact(packet.id, packet.brandName);
  // Tenants also get portal access to this property; a new account needs a
  // Clerk invitation link. Portal setup must never block the lease email.
  let portalUrl: string | null = null;
  if (signer.role === "tenant") {
    try {
      const [draft] = await d
        .select({ propertyId: leaseDrafts.propertyId })
        .from(leaseDrafts)
        .where(eq(leaseDrafts.id, packet.draftId));
      if (draft) {
        portalUrl = await preparePortalForLeaseTenant({
          actor,
          email: signer.email,
          name: signer.name,
          propertyId: draft.propertyId,
        });
      }
    } catch (error) {
      console.error(
        "Tenant portal invitation for lease failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  const expires = packet.expiresAt.toLocaleDateString("en-US", {
    dateStyle: "long",
    timeZone: "America/Chicago",
  });
  const intro = `Hello ${signer.name},\n\nYour lease is ready. Review the complete lease, download a copy, and sign securely.`;
  const details = `The request expires ${expires}. This private link opens your lease for signing. Do not forward it. You can also sign from your tenant portal.\n\nYou may request a paper copy or signing alternative by contacting ${contact}.`;
  const portalLead =
    "After signing, create your tenant portal account with this email address to keep a copy of your lease and see payments and maintenance requests.";
  const response = await sendLeaseMail({
    action: { label: "Review and sign the lease", url },
    brand: await currentEmailBrand(packet.brandName),
    htmlAfter: details,
    htmlText: intro,
    secondary: portalUrl
      ? {
          label: "Create your tenant portal account",
          lead: portalLead,
          url: portalUrl,
        }
      : undefined,
    subject: `${packet.brandName}: review and sign your lease`,
    text: `${intro}\n\nReview and sign the lease:\n${url}\n\n${details}${portalUrl ? `\n\n${portalLead}\n${portalUrl}` : ""}`,
    to: signer.email,
  });
  if (!response.ok) {
    return {
      error: "Email was not accepted. Try sending a new link.",
      status: 502,
    } as const;
  }
  await d
    .update(leaseSigners)
    .set({ invitedAt: sql`now()` })
    .where(eq(leaseSigners.id, signer.id));
  return { ok: true } as const;
}

/**
 * Sends signing links to everyone who has not been emailed yet. Runs after
 * the landlord signs, so tenants receive a lease the landlord already signed.
 */
export async function inviteRemainingSigners(packetId: string, actor: string) {
  const waiting = await db()
    .select({ id: leaseSigners.id })
    .from(leaseSigners)
    .where(
      and(
        eq(leaseSigners.packetId, packetId),
        isNull(leaseSigners.signedAt),
        isNull(leaseSigners.declinedAt),
        isNull(leaseSigners.invitedAt)
      )
    );
  const results: { id: string; ok: boolean }[] = [];
  for (const { id } of waiting) {
    const result =
      /* biome-ignore lint/performance/noAwaitInLoops: Resend rate limits; send one email at a time. */ await inviteSigner(
        id,
        actor
      ).catch(() => ({ error: "failed", status: 503 }) as const);
    results.push({ id, ok: !("error" in result) });
  }
  return results;
}

/**
 * Lets the signed-in owner sign as landlord: gives the landlord signer a new
 * private link and returns it, without email.
 */
export async function openOwnerSigning(packetId: string) {
  const packet = await activePacket(packetId);
  if (packet?.status !== "awaiting" || packet.expiresAt < new Date()) {
    return reply({ error: "This signing request is no longer active." }, 409);
  }
  const token = randomBytes(32).toString("hex");
  const [landlord] = await db()
    .update(leaseSigners)
    .set({ sessionHash: null, tokenHash: digest(token) })
    .where(
      and(
        eq(leaseSigners.packetId, packetId),
        eq(leaseSigners.role, "landlord"),
        isNull(leaseSigners.signedAt),
        isNull(leaseSigners.declinedAt)
      )
    )
    .returning({ id: leaseSigners.id });
  return landlord
    ? reply({ url: `/sign/lease/${token}` })
    : reply({ error: "The landlord has already signed this lease." }, 409);
}
