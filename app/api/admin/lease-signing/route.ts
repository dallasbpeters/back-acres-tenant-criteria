const pattern1 = /\{\{[^}]+\}\}/;

import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { authOptions } from "@/lib/adverse/google-auth";
import { db } from "@/lib/db";
import {
  brandVersions,
  leaseDrafts,
  leasePackets,
  leaseSigners,
} from "@/lib/db/schema";
import {
  documentText,
  type LeaseNode,
  textDocument,
} from "@/lib/leases/document";
import { leasePdf } from "@/lib/leases/pdf";
import { withSignaturePages } from "@/lib/leases/signature-pdf";
import {
  copySigningLink,
  inviteSigner,
  openOwnerSigning,
} from "@/lib/leases/signing-invite";
import { digest, packetInput, signingText } from "@/lib/leases/signing-model";
import { activePacket, completePacket } from "@/lib/leases/signing-store";
import { notRemoved } from "@/lib/management/not-removed";

function cleanDocument(node: LeaseNode): LeaseNode {
  return {
    ...node,
    ...(node.text ? { text: signingText(node.text) } : {}),
    ...(node.content ? { content: node.content.map(cleanDocument) } : {}),
  };
}
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  try {
    const draftId = z.uuid().parse(request.nextUrl.searchParams.get("draftId"));
    const packets = await db()
      .select({
        createdAt: leasePackets.createdAt,
        documentHash: leasePackets.documentHash,
        expiresAt: leasePackets.expiresAt,
        finalHash: leasePackets.finalHash,
        id: leasePackets.id,
        status: leasePackets.status,
      })
      .from(leasePackets)
      .where(eq(leasePackets.draftId, draftId))
      .orderBy(desc(leasePackets.createdAt));
    const rows: ((typeof packets)[number] & {
      signers: Pick<
        typeof leaseSigners.$inferSelect,
        | "declinedAt"
        | "email"
        | "id"
        | "invitedAt"
        | "name"
        | "role"
        | "signedAt"
      >[];
    })[] = [];
    for (const p of packets) {
      if (
        !(
          /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ (await activePacket(
            p.id
          ))
        )
      ) {
        continue;
      }
      const finalized = await completePacket(p.id);
      const signers = await db()
        .select({
          declinedAt: leaseSigners.declinedAt,
          email: leaseSigners.email,
          id: leaseSigners.id,
          invitedAt: leaseSigners.invitedAt,
          name: leaseSigners.name,
          role: leaseSigners.role,
          signedAt: leaseSigners.signedAt,
        })
        .from(leaseSigners)
        .where(eq(leaseSigners.packetId, p.id));
      rows.push({
        ...p,
        finalHash: finalized?.finalHash ?? p.finalHash,
        signers,
        status: finalized?.status ?? p.status,
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
  z.object({ action: z.literal("signAsOwner"), packetId: z.uuid() }),
  z.object({ action: z.literal("link"), signerId: z.uuid() }),
]);
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const parsed = command.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) {
    return reply(
      {
        error: parsed.error.issues[0]?.message ?? "Check the signing details.",
      },
      400
    );
  }
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
            notRemoved(leaseDrafts.propertyId)
          )
        );
      if (!draft) {
        const [orphan] = await d
          .select({ id: leaseDrafts.id })
          .from(leaseDrafts)
          .where(
            and(eq(leaseDrafts.id, c.data.draftId), notRemoved(leaseDrafts.id))
          );
        return orphan
          ? reply(
              {
                error:
                  "This lease's property was removed. Restore the property from Removed items, then send the lease.",
              },
              409
            )
          : reply({ error: "Lease not found." }, 404);
      }
      if (pattern1.test(draft.body)) {
        return reply(
          { error: "Complete all lease details before requesting signatures." },
          400
        );
      }
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
      const pdf = await withSignaturePages(
        await leasePdf(body, draft.id, pdfDocument, {
          forSigning: true,
          logoPng: brand?.logoPng ?? null,
          name: brand?.name ?? "Back Acres Rental",
        }),
        c.data.signers
      );
      const family = await d.execute(
        sql`with recursive ancestors as (select id,parent_id from lease_drafts where id=${draft.id} union all select l.id,l.parent_id from lease_drafts l join ancestors a on l.id=a.parent_id) select id from ancestors where parent_id is null limit 1`
      );
      const familyId = String(family.rows[0]?.id ?? draft.id);
      const packet = d.insert(leasePackets).values({
        basePdf: Buffer.from(pdf).toString("base64"),
        body,
        brandName: brand?.name ?? "Back Acres Rental",
        documentHash: digest(pdf),
        draftId: draft.id,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        familyId,
        id,
      });
      const signers = d.insert(leaseSigners).values(
        c.data.signers.map((s) => ({
          ...s,
          id: randomUUID(),
          packetId: id,
          tokenHash: digest(randomBytes(32)),
        }))
      );
      await d.batch([packet, signers]);
      return reply({ id }, 201);
    }
    if (c.action === "void") {
      const existing = await activePacket(c.packetId);
      if (!existing) {
        return reply({ error: "Packet not found." }, 404);
      }
      const rows = await d
        .update(leasePackets)
        .set({ status: "voided" })
        .where(
          and(
            eq(leasePackets.id, c.packetId),
            eq(leasePackets.status, "awaiting"),
            sql`exists(select 1 from ${leaseSigners} where ${leaseSigners.packetId}=${c.packetId} and ${leaseSigners.signedAt} is null)`
          )
        )
        .returning({ id: leasePackets.id });
      return rows.length
        ? reply({ ok: true })
        : reply({ error: "A fully signed lease cannot be voided here." }, 409);
    }
    if (c.action === "signAsOwner") {
      return await openOwnerSigning(c.packetId);
    }
    if (c.action === "link") {
      return await copySigningLink(c.signerId);
    }
    const result = await inviteSigner(
      c.signerId,
      (await getServerSession(authOptions))?.user?.email ?? "owner"
    );
    return "error" in result
      ? reply({ error: result.error }, result.status)
      : reply({ ok: true });
  } catch (error) {
    const reason = error as {
      cause?: { code?: string };
      code?: string;
    } | null;
    const code = reason?.code ?? reason?.cause?.code;
    console.error(
      "Lease signing request failed",
      code ?? "",
      error instanceof Error ? error.message : String(error)
    );
    // 23505: a unique index allows one pending packet per lease family.
    if (code === "23505") {
      return reply(
        {
          error:
            "This lease or an earlier version already has an open signing request. Cancel it first: open that version's signing panel and choose Cancel signing request.",
        },
        409
      );
    }
    return reply(
      {
        error:
          "Could not complete this request. Nothing was sent. Try again; if it keeps failing, the error is logged for review.",
      },
      503
    );
  }
}
