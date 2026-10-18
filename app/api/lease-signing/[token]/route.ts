import { sendLeaseMail } from "@/lib/leases/mail";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { leaseSigners, leasePackets, leaseDrafts } from "@/lib/db/schema";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { allowIntake } from "@/lib/management/security";
import { tokenSigner, completePacket } from "@/lib/leases/signing-store";
import {
  codeDigest,
  digest,
  SIGNING_CONSENT,
  SIGNING_CONSENT_VERSION,
  signingEvidence,
} from "@/lib/leases/signing-model";
import { signaturePng } from "@/lib/leases/branding";
const session = (r: NextRequest) =>
  r.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
function verified(r: NextRequest, s: typeof leaseSigners.$inferSelect) {
  const key = session(r);
  return (
    /^[a-f0-9]{64}$/.test(key) &&
    s.sessionHash === digest(key) &&
    !!s.sessionExpiresAt &&
    s.sessionExpiresAt > new Date()
  );
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params,
      ctx = await tokenSigner(token);
    if (!ctx)
      return reply(
        {
          error:
            "This signing link is unavailable or expired. Please contact your landlord.",
        },
        404,
      );
    const { signer, packet } = ctx;
    if (!verified(request, signer)) {
      if (request.nextUrl.searchParams.get("format") === "pdf")
        return reply(
          { error: "Verify your email again before downloading this lease." },
          401,
        );
      return reply({
        name: signer.name,
        email: signer.email.replace(/^(.).*(@.*)$/, "$1•••$2"),
        brandName: packet.brandName,
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
        Buffer.from(finalized.finalPdf ?? packet.basePdf, "base64"),
        {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="lease-${finalized.status === "completed" ? "signed" : "for-signature"}.pdf"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
    return reply({
      verified: true,
      name: signer.name,
      email: signer.email,
      brandName: packet.brandName,
      body: packet.body,
      documentHash: packet.documentHash,
      finalHash: finalized.finalHash,
      status: finalized.status,
      signedAt: signer.signedAt,
      declinedAt: signer.declinedAt,
      consent: SIGNING_CONSENT,
      consentVersion: SIGNING_CONSENT_VERSION,
      expiresAt: packet.expiresAt,
    });
  } catch {
    return reply({ error: "Could not load this lease. Try again." }, 503);
  }
}
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("code") }),
  z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/) }),
  z.object({
    action: z.literal("sign"),
    signature: z.string().max(500000),
    consent: z.literal(true),
    consentVersion: z.literal(SIGNING_CONSENT_VERSION),
    documentHash: z.string().length(64),
    name: z.string().trim().min(2).max(150),
  }),
  z.object({ action: z.literal("withdraw") }),
]);
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  const parsed = input.safeParse(
    await readBody(request, 510000).catch(() => null),
  );
  if (!parsed.success)
    return reply({ error: "Check the signing details and consent." }, 400);
  try {
    const { token } = await params,
      ctx = await tokenSigner(token);
    if (!ctx)
      return reply(
        { error: "This signing link is unavailable or expired." },
        404,
      );
    const { signer, packet } = ctx,
      c = parsed.data,
      d = db();
    if (!(await allowIntake(request, `lease-signing:${signer.id}:${c.action}`)))
      return reply(
        { error: "Too many attempts. Please try again later." },
        429,
      );
    if (c.action === "code") {
      if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL)
        return reply(
          {
            error:
              "Email verification is unavailable. Please contact your landlord.",
          },
          503,
        );
      const code = String(randomInt(100000, 1000000));
      const rows = await d
        .update(leaseSigners)
        .set({
          codeHash: codeDigest(token, code),
          codeAttempts: 0,
          codeExpiresAt: new Date(Date.now() + 10 * 60000),
        })
        .where(
          and(
            eq(leaseSigners.id, signer.id),
            sql`(${leaseSigners.codeExpiresAt} is null or ${leaseSigners.codeExpiresAt}<now()+interval '9 minutes')`,
          ),
        )
        .returning({ id: leaseSigners.id });
      if (!rows.length)
        return reply(
          { error: "Please wait a minute before requesting another code." },
          429,
        );
      const response = await sendLeaseMail({
        to: signer.email,
        subject: `${packet.brandName}: your lease verification code`,
        text: `Your lease signing verification code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this message and contact your landlord.`,
      });
      if (!response.ok)
        return reply(
          { error: "Code delivery failed. Please try again in a minute." },
          502,
        );
      return reply({ ok: true });
    }
    if (c.action === "verify") {
      const key = randomBytes(32).toString("hex"),
        rows = await d
          .update(leaseSigners)
          .set({
            codeAttempts: sql`${leaseSigners.codeAttempts}+1`,
            sessionHash: sql`case when ${leaseSigners.codeHash}=${codeDigest(token, c.code)} then ${digest(key)} else ${leaseSigners.sessionHash} end`,
            sessionExpiresAt: sql`case when ${leaseSigners.codeHash}=${codeDigest(token, c.code)} then now()+interval '30 minutes' else ${leaseSigners.sessionExpiresAt} end`,
            verifiedAt: sql`case when ${leaseSigners.codeHash}=${codeDigest(token, c.code)} and ${leaseSigners.signedAt} is null then now() else ${leaseSigners.verifiedAt} end`,
            codeHash: sql`case when ${leaseSigners.codeHash}=${codeDigest(token, c.code)} then null else ${leaseSigners.codeHash} end`,
          })
          .where(
            and(
              eq(leaseSigners.id, signer.id),
              sql`${leaseSigners.codeAttempts}<5 and ${leaseSigners.codeExpiresAt}>now() and ${leaseSigners.codeHash} is not null`,
            ),
          )
          .returning({ sessionHash: leaseSigners.sessionHash });
      return rows[0]?.sessionHash === digest(key)
        ? reply({ session: key })
        : reply(
            {
              error:
                "The code is incorrect or expired. Request a new code if needed.",
            },
            400,
          );
    }
    if (!verified(request, signer))
      return reply(
        { error: "Verify your email again before continuing." },
        401,
      );
    if (c.action === "withdraw") {
      const rows = await d
        .update(leaseSigners)
        .set({ declinedAt: sql`now()`, sessionHash: null })
        .where(
          and(eq(leaseSigners.id, signer.id), isNull(leaseSigners.signedAt)),
        )
        .returning({ id: leaseSigners.id });
      return rows.length
        ? reply({ ok: true })
        : reply(
            {
              error:
                "A recorded signature cannot be withdrawn here. Contact your landlord.",
            },
            409,
          );
    }
    if (packet.status !== "awaiting" || signer.signedAt || signer.declinedAt)
      return reply(
        { error: "This signing request is no longer available." },
        409,
      );
    if (
      c.name.normalize("NFKC").toLowerCase() !==
        signer.name.normalize("NFKC").toLowerCase() ||
      c.documentHash !== packet.documentHash ||
      !signer.pdfViewedAt
    )
      return reply(
        {
          error:
            "Download and review the lease PDF, then enter your full name exactly as shown.",
        },
        400,
      );
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
        500,
      );
    const evidence = signingEvidence({
      packetId: packet.id,
      documentHash: packet.documentHash,
      signerId: signer.id,
      name: signer.name,
      email: signer.email,
      role: signer.role,
      signatureHash: digest(png),
      consent: SIGNING_CONSENT,
      consentVersion: SIGNING_CONSENT_VERSION,
      signedAt: signedAt.toISOString(),
      verifiedAt: signer.verifiedAt!.toISOString(),
      pdfViewedAt: signer.pdfViewedAt!.toISOString(),
      ip,
      userAgent,
    });
    const result = await d.execute(
      sql`with eligible as (select p.id from lease_packets p join lease_drafts l on l.id=p.draft_id where p.id=${packet.id} and p.status='awaiting' and p.expires_at>now() and not exists(select 1 from removed_records r where r.entity_id in(l.id,l.property_id)) for update of p) update lease_signers s set signature_png=${png.toString("base64")},signature_hash=${digest(png)},signed_at=${signedAt.toISOString()},consent=${SIGNING_CONSENT},consent_version=${SIGNING_CONSENT_VERSION},ip=${ip},user_agent=${userAgent},evidence=${evidence.canonical},evidence_hash=${evidence.hash} from eligible where s.id=${signer.id} and s.packet_id=eligible.id and s.signed_at is null and s.declined_at is null and s.session_hash=${digest(session(request))} and s.session_expires_at>now() returning s.id`,
    );
    if (!result.rows.length)
      return reply(
        {
          error:
            "This lease changed or was already signed. Reload to check its status.",
        },
        409,
      );
    await completePacket(packet.id);
    return reply({ ok: true, signedAt: signedAt.toISOString() });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error && /signature|Draw|draw/.test(e.message)
            ? e.message
            : "Could not complete this step. Reload to check the lease status before trying again.",
      },
      503,
    );
  }
}
