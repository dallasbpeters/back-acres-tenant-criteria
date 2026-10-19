import { requireValue } from "@/lib/required";

const pattern1 = /^Bearer /;
const pattern2 = /^[a-f0-9]{64}$/;
const pattern3 = /^(.).*(@.*)$/;
const pattern4 = /signature|Draw|draw/;

import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { leaseSigners } from "@/lib/db/schema";
import { signaturePng } from "@/lib/leases/branding";
import { leaseContact } from "@/lib/leases/contact";
import { signatureOrder } from "@/lib/leases/signature-page";
import { inviteRemainingSigners } from "@/lib/leases/signing-invite";
import {
  digest,
  SIGNING_CONSENT,
  SIGNING_CONSENT_VERSION,
  signingEvidence,
} from "@/lib/leases/signing-model";
import { sendSigningNotices } from "@/lib/leases/signing-notices";
import {
  completePacket,
  currentLeasePdf,
  tokenSigner,
} from "@/lib/leases/signing-store";
import { allowIntake } from "@/lib/management/security";

const session = (r: NextRequest) =>
  r.headers.get("authorization")?.replace(pattern1, "") ?? "";
function verified(r: NextRequest, s: typeof leaseSigners.$inferSelect) {
  const key = session(r);
  return (
    pattern2.test(key) &&
    s.sessionHash === digest(key) &&
    !!s.sessionExpiresAt &&
    s.sessionExpiresAt > new Date()
  );
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params,
      ctx = await tokenSigner(token);
    if (!ctx) {
      return reply(
        {
          error:
            "This signing link was replaced or has expired. Sign in to your tenant portal to open the lease, or contact Back Acres Rentals.",
        },
        404
      );
    }
    const { signer, packet } = ctx;
    const contact = await leaseContact(packet.id, packet.brandName);
    if (!verified(request, signer)) {
      if (request.nextUrl.searchParams.get("format") === "pdf") {
        return reply(
          {
            error: "Your signing session ended. Reload this page to continue.",
          },
          401
        );
      }
      return reply({
        brandName: packet.brandName,
        contact,
        email: signer.email
          ? signer.email.replace(pattern3, "$1•••$2")
          : `•••${(signer.phone ?? "").slice(-4)}`,
        name: signer.name,
        verified: false,
      });
    }
    const finalized = (await completePacket(packet.id)) ?? packet;
    if (request.nextUrl.searchParams.get("format") === "pdf") {
      await db()
        .update(leaseSigners)
        .set({ pdfViewedAt: sql`coalesce(${leaseSigners.pdfViewedAt},now())` })
        .where(eq(leaseSigners.id, signer.id));
      return new NextResponse(
        new Uint8Array(await currentLeasePdf(finalized)),
        {
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="lease-${finalized.status === "completed" ? "signed" : "for-signature"}.pdf"`,
            "Content-Type": "application/pdf",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
          },
        }
      );
    }
    const everyone = await db()
      .select({
        name: leaseSigners.name,
        role: leaseSigners.role,
        signedAt: leaseSigners.signedAt,
      })
      .from(leaseSigners)
      .where(eq(leaseSigners.packetId, packet.id));
    return reply({
      body: packet.body,
      brandName: packet.brandName,
      consent: signer.consent || SIGNING_CONSENT,
      consentVersion: signer.consentVersion || SIGNING_CONSENT_VERSION,
      contact,
      declinedAt: signer.declinedAt,
      documentHash: packet.documentHash,
      email: signer.email,
      expiresAt: packet.expiresAt,
      finalHash: finalized.finalHash,
      name: signer.name,
      role: signer.role,
      signedAt: signer.signedAt,
      signers: signatureOrder(everyone.map((s) => ({ ...s, email: "" }))).map(
        ({ name, role, signedAt }) => ({ name, role, signedAt })
      ),
      status: finalized.status,
      verified: true,
    });
  } catch {
    return reply({ error: "Could not load this lease. Try again." }, 503);
  }
}
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open") }),
  z.object({
    action: z.literal("sign"),
    consent: z.literal(true),
    consentVersion: z.literal(SIGNING_CONSENT_VERSION),
    documentHash: z.string().length(64),
    name: z.string().trim().min(2).max(150),
    signature: z.string().max(500_000),
  }),
  z.object({ action: z.literal("withdraw") }),
  z.object({ action: z.literal("claim") }),
]);
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!sameOrigin(request)) {
    return reply({ error: "Invalid origin." }, 403);
  }
  const parsed = input.safeParse(
    await readBody(request, 510_000).catch(() => null)
  );
  if (!parsed.success) {
    return reply({ error: "Check the signing details and consent." }, 400);
  }
  try {
    const { token } = await params,
      ctx = await tokenSigner(token);
    if (!ctx) {
      return reply(
        { error: "This signing link is unavailable or expired." },
        404
      );
    }
    const { signer, packet } = ctx,
      c = parsed.data,
      d = db();
    const contact = await leaseContact(packet.id, packet.brandName);
    if (
      !(await allowIntake(request, `lease-signing:${signer.id}:${c.action}`))
    ) {
      return reply(
        { error: "Too many attempts. Please try again later." },
        429
      );
    }
    if (c.action === "open") {
      // The private link went only to this signer's email, so opening it is
      // the email check. No second code is needed.
      const key = randomBytes(32).toString("hex");
      await d
        .update(leaseSigners)
        .set({
          sessionExpiresAt: sql`now()+interval '30 minutes'`,
          sessionHash: digest(key),
          verifiedAt: sql`case when ${leaseSigners.signedAt} is null then coalesce(${leaseSigners.verifiedAt},now()) else ${leaseSigners.verifiedAt} end`,
        })
        .where(eq(leaseSigners.id, signer.id));
      return reply({ session: key });
    }
    if (!verified(request, signer)) {
      return reply(
        { error: "Your signing session ended. Reload this page to continue." },
        401
      );
    }
    if (c.action === "claim") {
      // A one-time code lets the portal account created next attach to this
      // signer, whatever email or username that account uses.
      if (signer.role !== "tenant") {
        return reply({ error: "Only tenants have portal accounts." }, 400);
      }
      const code = randomBytes(32).toString("hex");
      await d
        .update(leaseSigners)
        .set({
          claimExpiresAt: sql`now()+interval '7 days'`,
          claimHash: digest(code),
        })
        .where(eq(leaseSigners.id, signer.id));
      return reply({ code });
    }
    if (c.action === "withdraw") {
      const rows = await d
        .update(leaseSigners)
        .set({ declinedAt: sql`now()`, sessionHash: null })
        .where(
          and(eq(leaseSigners.id, signer.id), isNull(leaseSigners.signedAt))
        )
        .returning({ id: leaseSigners.id });
      return rows.length
        ? reply({ ok: true })
        : reply(
            {
              error: `A recorded signature cannot be withdrawn here. Contact ${contact}.`,
            },
            409
          );
    }
    if (packet.status !== "awaiting" || signer.signedAt || signer.declinedAt) {
      return reply(
        { error: "This signing request is no longer available." },
        409
      );
    }
    if (
      c.name.normalize("NFKC").toLowerCase() !==
        signer.name.normalize("NFKC").toLowerCase() ||
      c.documentHash !== packet.documentHash ||
      !signer.pdfViewedAt
    ) {
      return reply(
        {
          error:
            "Download and review the lease PDF, then enter your full name exactly as shown.",
        },
        400
      );
    }
    let png: Buffer;
    try {
      png = await signaturePng(c.signature);
    } catch {
      return reply({ error: "Please draw or type a complete signature." }, 400);
    }
    const signedAt = new Date(),
      ip = (
        request.headers.get("x-vercel-forwarded-for") ??
        request.headers.get("x-forwarded-for") ??
        "unavailable"
      ).slice(0, 200),
      userAgent = (request.headers.get("user-agent") ?? "unavailable").slice(
        0,
        500
      );
    const evidence = signingEvidence({
      consent: SIGNING_CONSENT,
      consentVersion: SIGNING_CONSENT_VERSION,
      documentHash: packet.documentHash,
      email: signer.email ?? signer.phone ?? "",
      ip,
      name: signer.name,
      packetId: packet.id,
      pdfViewedAt: requireValue(
        signer.pdfViewedAt,
        "Expected signer.pdfViewedAt"
      ).toISOString(),
      role: signer.role,
      signatureHash: digest(png),
      signedAt: signedAt.toISOString(),
      signerId: signer.id,
      userAgent,
      verifiedAt: requireValue(
        signer.verifiedAt,
        "Expected signer.verifiedAt"
      ).toISOString(),
    });
    const result = await d.execute(
      sql`with eligible as (select p.id from lease_packets p join lease_drafts l on l.id=p.draft_id where p.id=${packet.id} and p.status='awaiting' and p.expires_at>now() and not exists(select 1 from removed_records r where r.entity_id in(l.id,l.property_id)) for update of p) update lease_signers s set signature_png=${png.toString("base64")},signature_hash=${digest(png)},signed_at=${signedAt.toISOString()},consent=${SIGNING_CONSENT},consent_version=${SIGNING_CONSENT_VERSION},ip=${ip},user_agent=${userAgent},evidence=${evidence.canonical},evidence_hash=${evidence.hash} from eligible where s.id=${signer.id} and s.packet_id=eligible.id and s.signed_at is null and s.declined_at is null and s.session_hash=${digest(session(request))} and s.session_expires_at>now() returning s.id`
    );
    if (!result.rows.length) {
      return reply(
        {
          error:
            "This lease changed or was already signed. Reload to check its status.",
        },
        409
      );
    }
    await completePacket(packet.id);
    // The landlord signs first; tenants are emailed only after that, so they
    // receive a lease the landlord already signed.
    const invited =
      signer.role === "landlord"
        ? await inviteRemainingSigners(
            packet.id,
            signer.email ?? "landlord"
          ).catch((error) => {
            console.error(
              "Tenant signing emails after landlord signature failed",
              error instanceof Error ? error.message : String(error)
            );
            return [];
          })
        : [];
    await sendSigningNotices(packet.id, signer.id).catch((error) =>
      console.error(
        "Lease signing notices failed",
        error instanceof Error ? error.message : String(error)
      )
    );
    return reply({
      invited: invited.filter((row) => row.ok).length,
      notInvited: invited.filter((row) => !row.ok).length,
      ok: true,
      signedAt: signedAt.toISOString(),
    });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error && pattern4.test(e.message)
            ? e.message
            : "Could not complete this step. Reload to check the lease status before trying again.",
      },
      503
    );
  }
}
