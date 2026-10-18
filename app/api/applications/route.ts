import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { applications, properties } from "@/lib/db/schema";
import { applicationSchema } from "@/lib/management/model";
import { notRemoved } from "@/lib/management/not-removed";
import { allowIntake } from "@/lib/management/security";
import { POLICY, selectionCriteriaText } from "@/lib/policy";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return reply({ error: "Invalid origin." }, 403);
  }
  const parsed = z
    .object({
      criteriaVersion: z.string().max(100).optional(),
      data: applicationSchema,
      id: z.string().uuid(),
      propertyId: z.string().uuid(),
      revision: z.number().int(),
      website: z.literal(""),
    })
    .safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) {
    return reply(
      { error: "Complete all required fields and acknowledgments." },
      400
    );
  }
  try {
    if (!(await allowIntake(request, "applications"))) {
      return reply(
        { error: "Too many submissions. Please try again in an hour." },
        429
      );
    }
    const b = parsed.data;
    const d = db();
    const [p] = await d
      .select()
      .from(properties)
      .where(and(eq(properties.id, b.propertyId), notRemoved(properties.id)));
    if (!(p?.data.published && p.data.acceptingApplications)) {
      return reply(
        { error: "This property is not accepting applications." },
        409
      );
    }
    if (p.revision !== b.revision || b.criteriaVersion !== POLICY.version) {
      return reply(
        {
          error:
            "The listing or criteria have changed. Reload and review them before applying.",
        },
        409
      );
    }
    await d
      .insert(applications)
      .values({
        criteriaSnapshot: selectionCriteriaText(),
        criteriaVersion: POLICY.version,
        data: b.data,
        id: b.id,
        propertyId: p.id,
        propertySnapshot: {
          ...p.data,
          criteria: selectionCriteriaText(),
          criteriaVersion: POLICY.version,
        },
      })
      .onConflictDoNothing();
    return reply({ receipt: b.id }, 201);
  } catch {
    return reply(
      {
        error:
          "Could not save your application. Your entries remain on this screen; please try again.",
      },
      503
    );
  }
}
