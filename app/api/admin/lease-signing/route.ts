import { sendLeaseMail } from "@/lib/leases/mail";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, desc, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  leaseDrafts,
  leasePackets,
  leaseSigners,
  brandVersions,
} from "@/lib/db/schema";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { notRemoved } from "@/lib/management/not-removed";
import { packetInput, digest, signingText } from "@/lib/leases/signing-model";
import { leasePdf } from "@/lib/leases/pdf";
import { activePacket, completePacket } from "@/lib/leases/signing-store";
import { siteUrl } from "@/lib/management/security";
import {
  documentText,
  textDocument,
  type LeaseNode,
} from "@/lib/leases/document";
function cleanDocument(node: LeaseNode): LeaseNode {
  return {
    ...node,
    ...(node.text ? { text: signingText(node.text) } : {}),
    ...(node.content ? { content: node.content.map(cleanDocument) } : {}),
  };
}
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const draftId = z.uuid().parse(request.nextUrl.searchParams.get("draftId"));
    const packets = await db()
      .select({
        id: leasePackets.id,
        status: leasePackets.status,
        documentHash: leasePackets.documentHash,
        finalHash: leasePackets.finalHash,
        createdAt: leasePackets.createdAt,
        expiresAt: leasePackets.expiresAt,
      })
      .from(leasePackets)
      .where(eq(leasePackets.draftId, draftId))
      .orderBy(desc(leasePackets.createdAt));
    const rows = [];
    for (const p of packets) {
      if (!(await activePacket(p.id))) continue;
      const finalized = await completePacket(p.id);
      const signers = await db()
        .select({
          id: leaseSigners.id,
          name: leaseSigners.name,
          email: leaseSigners.email,
          role: leaseSigners.role,
          signedAt: leaseSigners.signedAt,
          invitedAt: leaseSigners.invitedAt,
          declinedAt: leaseSigners.declinedAt,
        })
        .from(leaseSigners)
        .where(eq(leaseSigners.packetId, p.id));
      rows.push({
        ...p,
        status: finalized?.status ?? p.status,
        finalHash: finalized?.finalHash ?? p.finalHash,
        signers,
      });
    }
    return reply({ packets: rows });
  } catch {
    return reply({ error: "Could not load signing records." }, 503);
  }
}
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: packetInput }),
  z.object({ action: z.literal("invite"), signerId: z.uuid() }),
  z.object({ action: z.literal("void"), packetId: z.uuid() }),
]);
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = command.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success)
    return reply(
      {
        error: parsed.error.issues[0]?.message ?? "Check the signing details.",
      },
      400,
    );
  try {
    const c = parsed.data,
      d = db();
    if (c.action === "create") {
      const [draft] = await d
        .select()
        .from(leaseDrafts)
        .where(
          and(
            eq(leaseDrafts.id, c.data.draftId),
            notRemoved(leaseDrafts.id),
            notRemoved(leaseDrafts.propertyId),
          ),
        );
      if (!draft) return reply({ error: "Lease not found." }, 404);
      if (/\{\{[^}]+\}\}/.test(draft.body))
        return reply(
          { error: "Complete all lease details before requesting signatures." },
          400,
        );
      const [brand] = await d
        .select()
        .from(brandVersions)
        .orderBy(desc(brandVersions.createdAt))
        .limit(1);
      const id = randomUUID(),
        body = signingText(draft.body),
        document = draft.document ? cleanDocument(draft.document) : null;
      const pdfDocument =
        document && documentText(document).trim() === body.trim()
          ? document
          : textDocument(body);
      const pdf = await leasePdf(body, draft.id, pdfDocument, {
        name: brand?.name ?? "Back Acres Rental",
        logoPng: brand?.logoPng ?? null,
        forSigning: true,
      });
      const family = await d.execute(
        sql`with recursive ancestors as (select id,parent_id from lease_drafts where id=${draft.id} union all select l.id,l.parent_id from lease_drafts l join ancestors a on l.id=a.parent_id) select id from ancestors where parent_id is null limit 1`,
      );
      const familyId = String(family.rows[0]?.id ?? draft.id);
      const packet = d.insert(leasePackets).values({
        id,
        familyId,
        draftId: draft.id,
        body,
        basePdf: Buffer.from(pdf).toString("base64"),
        documentHash: digest(pdf),
        brandName: brand?.name ?? "Back Acres Rental",
        expiresAt: new Date(Date.now() + 30 * 86400000),
      });
      const signers = d.insert(leaseSigners).values(
        c.data.signers.map((s) => ({
          ...s,
          id: randomUUID(),
          packetId: id,
          tokenHash: digest(randomBytes(32)),
        })),
      );
      await d.batch([packet, signers]);
      return reply({ id }, 201);
    }
    if (c.action === "void") {
      const packet = await activePacket(c.packetId);
      if (!packet) return reply({ error: "Packet not found." }, 404);
      const rows = await d
        .update(leasePackets)
        .set({ status: "voided" })
        .where(
          and(
            eq(leasePackets.id, c.packetId),
            eq(leasePackets.status, "awaiting"),
            sql`exists(select 1 from ${leaseSigners} where ${leaseSigners.packetId}=${c.packetId} and ${leaseSigners.signedAt} is null)`,
          ),
        )
        .returning({ id: leasePackets.id });
      return rows.length
        ? reply({ ok: true })
        : reply({ error: "A fully signed lease cannot be voided here." }, 409);
    }
    const [signer] = await d
      .select()
      .from(leaseSigners)
      .where(eq(leaseSigners.id, c.signerId));
    if (!signer) return reply({ error: "Signer not found." }, 404);
    const packet = await activePacket(signer.packetId);
    if (
      !packet ||
      packet.status !== "awaiting" ||
      packet.expiresAt < new Date() ||
      signer.declinedAt ||
      signer.signedAt
    )
      return reply({ error: "This signing request is no longer active." }, 409);
    if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL)
      return reply(
        { error: "Configure Resend before sending signing links." },
        503,
      );
    const token = randomBytes(32).toString("hex"),
      url = `${siteUrl()}/sign/lease/${token}`;
    const updated = await d
      .update(leaseSigners)
      .set({
        tokenHash: digest(token),
        codeHash: null,
        sessionHash: null,
        verifiedAt: null,
      })
      .where(and(eq(leaseSigners.id, signer.id), isNull(leaseSigners.signedAt)))
      .returning({ id: leaseSigners.id });
    if (!updated.length)
      return reply({ error: "This signer has already signed." }, 409);
    const response = await sendLeaseMail({
      to: signer.email,
      subject: `${packet.brandName}: review and sign your lease`,
      text: `Hello ${signer.name},\n\nReview the complete lease, download a copy, and sign securely here:\n${url}\n\nThe request expires ${packet.expiresAt.toISOString()}. A separate verification code will be sent to this email address before signing. Do not forward this private link.\n\nYou may request a paper copy or signing alternative by contacting your landlord.`,
    });
    if (!response.ok)
      return reply(
        { error: "Email was not accepted. Try sending a new link." },
        502,
      );
    await d
      .update(leaseSigners)
      .set({ invitedAt: sql`now()` })
      .where(eq(leaseSigners.id, signer.id));
    return reply({ ok: true });
  } catch {
    return reply(
      {
        error:
          "Could not complete this request. A pending signing packet may exist for this lease or an earlier version; cancel it before replacing it.",
      },
      409,
    );
  }
}
