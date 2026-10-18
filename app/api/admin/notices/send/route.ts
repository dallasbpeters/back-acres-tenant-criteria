import { notRemoved } from "@/lib/management/not-removed";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { noticeVersions, noticeDeliveries } from "@/lib/db/schema";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { deliverVersion } from "@/lib/adverse/delivery";
import { sendErrors } from "@/lib/adverse/notice";
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  let id: string;
  try {
    id = z
      .object({ versionId: z.string().uuid(), confirmed: z.literal(true) })
      .parse(await readBody(request)).versionId;
  } catch {
    return reply({ error: "Confirm a saved version before sending." }, 400);
  }
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL)
    return reply(
      { error: "Resend is not configured. Your saved notice is safe." },
      503,
    );
  const database = db();
  try {
    const [version] = await database
      .select()
      .from(noticeVersions)
      .where(
        and(eq(noticeVersions.id, id), notRemoved(noticeVersions.documentId)),
      );
    if (!version) return reply({ error: "Notice not found." }, 404);
    const errors = sendErrors(version.notice);
    if (errors.length) return reply({ error: errors.join(" ") }, 400);
    const result = await deliverVersion({
      claim: async () => {
        const rows = await database
          .insert(noticeDeliveries)
          .values({ versionId: id, status: "sending" })
          .onConflictDoNothing()
          .returning();
        return rows.length > 0;
      },
      send: async () => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `adverse/${id}`,
          },
          body: JSON.stringify({
            from: process.env.FROM_EMAIL,
            to: [version.notice.applicantEmail],
            subject: version.subject,
            html: version.html,
            text: version.plainText,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = response.ok ? await response.json() : {};
        return {
          ok: response.ok,
          status: response.status,
          id: typeof data.id === "string" ? data.id : undefined,
        };
      },
      record: async (status, resendId) => {
        await database
          .update(noticeDeliveries)
          .set({
            status,
            resendId,
            acceptedAt: status === "accepted" ? new Date() : undefined,
          })
          .where(eq(noticeDeliveries.versionId, id));
      },
    });
    return reply(result.body, result.status);
  } catch {
    return reply(
      {
        error:
          "Could not complete the request. Refresh the history and check Resend before retrying.",
      },
      503,
    );
  }
}
