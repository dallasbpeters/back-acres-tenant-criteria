import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { maintenanceRequests, tenantAccess } from "@/lib/db/schema";
import { maintenanceSchema } from "@/lib/management/model";
import { allowIntake } from "@/lib/management/security";
import { assignment, tenantIdentity } from "@/lib/tenant/access";

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settings"),
    id: z.string().uuid(),
    phone: z.string().trim().max(50),
  }),
  z.object({
    action: z.literal("maintenance"),
    data: maintenanceSchema,
    id: z.string().uuid(),
  }),
]);
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return reply({ error: "Invalid origin." }, 403);
  }
  try {
    const userId = await tenantIdentity();
    if (!userId) {
      return reply({ error: "Please sign in." }, 401);
    }
    const parsed = commandSchema.safeParse(
      await readBody(request).catch(() => null)
    );
    if (!parsed.success) {
      return reply({ error: "Check the required fields." }, 400);
    }
    const c = parsed.data;
    const access = await assignment(userId, c.id);
    if (!access) {
      return reply({ error: "This tenancy is not available." }, 404);
    }
    const d = db();
    if (c.action === "settings") {
      await d
        .update(tenantAccess)
        .set({ phone: c.phone })
        .where(eq(tenantAccess.id, access.id));
      return reply({ ok: true });
    }
    if (!(await allowIntake(request, `tenant-maintenance:${access.id}`))) {
      return reply(
        { error: "Too many requests. Please contact the owner directly." },
        429
      );
    }
    const id = randomUUID();
    await d.insert(maintenanceRequests).values({
      data: c.data,
      id,
      propertyId: access.propertyId,
      residentLinkId: access.residentLinkId,
    });
    return reply({ receipt: id }, 201);
  } catch {
    return reply(
      { error: "Could not save. Please retry or contact the owner." },
      503
    );
  }
}
