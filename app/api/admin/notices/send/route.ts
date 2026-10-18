import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { deliverVersion } from "@/lib/adverse/delivery";
import { sendErrors } from "@/lib/adverse/notice";
import { db } from "@/lib/db";
import { noticeDeliveries, noticeVersions } from "@/lib/db/schema";
import { currentEmailBrand } from "@/lib/email-brand";
import { brandedEmailHtml } from "@/lib/email-layout";
import { notRemoved } from "@/lib/management/not-removed";
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  let id: string;
  try {
    id = z
      .object({ confirmed: z.literal(true), versionId: z.string().uuid() })
      .parse(await readBody(request)).versionId;
  } catch {
    return reply({ error: "Confirm a saved version before sending." }, 400);
  }
  if (!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL)) {
    return reply(
      { error: "Resend is not configured. Your saved notice is safe." },
      503
    );
  }
  const database = db();
  try {
    const [version] = await database
      .select()
      .from(noticeVersions)
      .where(
        and(eq(noticeVersions.id, id), notRemoved(noticeVersions.documentId))
      );
    if (!version) {
      return reply({ error: "Notice not found." }, 404);
    }
    const errors = sendErrors(version.notice);
    if (errors.length) {
      return reply({ error: errors.join(" ") }, 400);
    }
    const result = await deliverVersion({
      claim: async () => {
        const rows = await database
          .insert(noticeDeliveries)
          .values({ status: "sending", versionId: id })
          .onConflictDoNothing()
          .returning();
        return rows.length > 0;
      },
      record: async (status, resendId) => {
        await database
          .update(noticeDeliveries)
          .set({
            acceptedAt: status === "accepted" ? new Date() : undefined,
            resendId,
            status,
          })
          .where(eq(noticeDeliveries.versionId, id));
      },
      send: async () => {
        const response = await fetch("https://api.resend.com/emails", {
          body: JSON.stringify({
            from: process.env.FROM_EMAIL,
            html: brandedEmailHtml(await currentEmailBrand(), version.html),
            subject: version.subject,
            text: version.plainText,
            to: [version.notice.applicantEmail],
          }),
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `adverse/${id}`,
          },
          method: "POST",
          signal: AbortSignal.timeout(15_000),
        });
        const data = response.ok ? await response.json() : {};
        return {
          id: typeof data.id === "string" ? data.id : undefined,
          ok: response.ok,
          status: response.status,
        };
      },
    });
    return reply(result.body, result.status);
  } catch {
    return reply(
      {
        error:
          "Could not complete the request. Refresh the history and check Resend before retrying.",
      },
      503
    );
  }
}
