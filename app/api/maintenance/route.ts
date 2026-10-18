import { notRemoved } from "@/lib/management/not-removed";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { residentLinks, maintenanceRequests } from "@/lib/db/schema";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { maintenanceSchema } from "@/lib/management/model";
import { allowIntake, tokenId } from "@/lib/management/security";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  const parsed = z
    .object({
      id: z.string().uuid(),
      token: z.string().max(110),
      website: z.literal(""),
      data: maintenanceSchema,
    })
    .safeParse(await readBody(request).catch(() => null));
  if (!parsed.success)
    return reply({ error: "Complete all required fields." }, 400);
  try {
    const b = parsed.data;
    const id = tokenId("maintenance", b.token);
    if (!id) return reply({ error: "Invalid resident link." }, 404);
    const d = db();
    const [link] = await d
      .select()
      .from(residentLinks)
      .where(and(eq(residentLinks.id, id), notRemoved(residentLinks.id)));
    if (!link || link.revoked || link.expiresAt.getTime() < Date.now())
      return reply(
        { error: "This link has expired. Contact the property owner." },
        404,
      );
    if (!(await allowIntake(request, `maintenance:${id}`)))
      return reply(
        { error: "Too many requests. Please contact the owner directly." },
        429,
      );
    await d
      .insert(maintenanceRequests)
      .values({
        id: b.id,
        propertyId: link.propertyId,
        residentLinkId: id,
        data: b.data,
      })
      .onConflictDoNothing();
    return reply({ receipt: b.id }, 201);
  } catch {
    return reply(
      {
        error: "Could not save the request. Please retry or contact the owner.",
      },
      503,
    );
  }
}
