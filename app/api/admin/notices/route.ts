import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { noticeVersions, noticeDeliveries } from "@/lib/db/schema";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { noticeSchema, renderNotice } from "@/lib/adverse/notice";
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const offset = Math.max(
      0,
      Math.min(
        1000000,
        Number(request.nextUrl.searchParams.get("offset")) || 0,
      ),
    );
    const rows = await db()
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
      .orderBy(desc(noticeVersions.createdAt))
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
