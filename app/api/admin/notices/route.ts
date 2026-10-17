import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { and, or, ilike, isNull, sql, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { noticeVersions, noticeDeliveries } from "@/lib/db/schema";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { noticeSchema, renderNotice } from "@/lib/adverse/notice";
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const database = db();
    const documentId = request.nextUrl.searchParams.get("documentId");
    if (documentId && !z.string().uuid().safeParse(documentId).success)
      return reply({ error: "Invalid notice identifier." }, 400);
    if (request.nextUrl.searchParams.get("view") === "list") {
      const offset = Math.max(
        0,
        Math.min(
          1000000,
          Math.floor(Number(request.nextUrl.searchParams.get("offset")) || 0),
        ),
      );
      const q = (request.nextUrl.searchParams.get("q") ?? "")
        .trim()
        .slice(0, 200);
      const status = request.nextUrl.searchParams.get("status") ?? "all";
      if (
        ![
          "all",
          "draft",
          "accepted",
          "sending",
          "unknown",
          "rejected",
        ].includes(status)
      )
        return reply({ error: "Invalid notice status." }, 400);
      const latest = database
        .selectDistinctOn([noticeVersions.documentId], {
          id: noticeVersions.id,
          documentId: noticeVersions.documentId,
          version: noticeVersions.version,
          applicantName:
            sql<string>`${noticeVersions.notice}->>'applicantName'`.as(
              "applicant_name",
            ),
          applicantEmail:
            sql<string>`${noticeVersions.notice}->>'applicantEmail'`.as(
              "applicant_email",
            ),
          property: sql<string>`${noticeVersions.notice}->>'property'`.as(
            "property",
          ),
          action: sql<string>`${noticeVersions.notice}->>'action'`.as("action"),
          createdAt: noticeVersions.createdAt,
          status: noticeDeliveries.status,
        })
        .from(noticeVersions)
        .leftJoin(
          noticeDeliveries,
          eq(noticeVersions.id, noticeDeliveries.versionId),
        )
        .orderBy(noticeVersions.documentId, desc(noticeVersions.version))
        .as("latest_notices");
      const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await database
        .select({
          id: latest.id,
          documentId: latest.documentId,
          version: latest.version,
          applicantName: latest.applicantName,
          applicantEmail: latest.applicantEmail,
          property: latest.property,
          action: latest.action,
          createdAt: latest.createdAt,
          status: latest.status,
          lastAcceptedVersion: sql<
            number | null
          >`(select max(v.version) from adverse_notice_versions v join adverse_notice_deliveries d on d.version_id=v.id where v.document_id=${latest.documentId} and d.status='accepted')`,
        })
        .from(latest)
        .where(
          and(
            q
              ? or(
                  ilike(latest.applicantName, pattern),
                  ilike(latest.applicantEmail, pattern),
                  ilike(latest.property, pattern),
                )
              : undefined,
            status === "all"
              ? undefined
              : status === "draft"
                ? isNull(latest.status)
                : eq(latest.status, status),
          ),
        )
        .orderBy(desc(latest.createdAt), desc(latest.documentId))
        .limit(26)
        .offset(offset);
      return reply({
        documents: rows.slice(0, 25),
        hasMore: rows.length > 25,
        nextOffset: offset + 25,
      });
    }
    const offset = Math.max(
      0,
      Math.min(
        1000000,
        Number(request.nextUrl.searchParams.get("offset")) || 0,
      ),
    );
    const rows = await database
      .select({
        id: noticeVersions.id,
        documentId: noticeVersions.documentId,
        version: noticeVersions.version,
        notice: noticeVersions.notice,
        html: noticeVersions.html,
        createdAt: noticeVersions.createdAt,
        status: noticeDeliveries.status,
        resendId: noticeDeliveries.resendId,
      })
      .from(noticeVersions)
      .leftJoin(
        noticeDeliveries,
        eq(noticeVersions.id, noticeDeliveries.versionId),
      )
      .where(documentId ? eq(noticeVersions.documentId, documentId) : undefined)
      .orderBy(desc(noticeVersions.version), desc(noticeVersions.createdAt))
      .limit(200)
      .offset(Math.floor(offset));
    return reply({ versions: rows });
  } catch {
    return reply(
      { error: "Could not load notices. Check the database configuration." },
      503,
    );
  }
}
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  let data;
  try {
    data = z
      .object({
        notice: noticeSchema,
        parentId: z.string().uuid().nullable(),
        requestId: z.string().uuid(),
      })
      .parse(await readBody(request));
  } catch {
    return reply(
      { error: "Invalid notice. Check the fields and reason formatting." },
      400,
    );
  }
  try {
    const database = db();
    const existing = await database
      .select()
      .from(noticeVersions)
      .where(eq(noticeVersions.id, data.requestId));
    if (existing[0]) return reply({ version: existing[0] });
    let documentId: string = randomUUID();
    let version = 1;
    if (data.parentId) {
      const [parent] = await database
        .select()
        .from(noticeVersions)
        .where(eq(noticeVersions.id, data.parentId));
      if (!parent)
        return reply({ error: "The previous version no longer exists." }, 404);
      const [latest] = await database
        .select()
        .from(noticeVersions)
        .where(eq(noticeVersions.documentId, parent.documentId))
        .orderBy(desc(noticeVersions.version))
        .limit(1);
      if (latest.id !== parent.id)
        return reply(
          {
            error:
              "A newer version exists. Load it before saving your changes.",
          },
          409,
        );
      documentId = parent.documentId;
      version = parent.version + 1;
    }
    const rendered = renderNotice(data.notice);
    const [saved] = await database
      .insert(noticeVersions)
      .values({
        id: data.requestId,
        documentId,
        version,
        notice: data.notice,
        subject: rendered.subject,
        html: rendered.html,
        plainText: rendered.text,
      })
      .onConflictDoNothing()
      .returning();
    if (!saved)
      return reply(
        { error: "Another save completed first. Reload the latest version." },
        409,
      );
    return reply({ version: saved });
  } catch {
    return reply(
      {
        error:
          "Could not save this version. Your edits are still on this screen.",
      },
      503,
    );
  }
}
