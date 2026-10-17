import { POLICY, selectionCriteriaText } from "@/lib/policy";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { applications, properties } from "@/lib/db/schema";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { applicationSchema } from "@/lib/management/model";
import { allowIntake } from "@/lib/management/security";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  const parsed = z
    .object({
      id: z.string().uuid(),
      propertyId: z.string().uuid(),
      revision: z.number().int(),
      criteriaVersion: z.string().max(100).optional(),
      website: z.literal(""),
      data: applicationSchema,
    })
    .safeParse(await readBody(request).catch(() => null));
  if (!parsed.success)
    return reply(
      { error: "Complete all required fields and acknowledgments." },
      400,
    );
  try {
    if (!(await allowIntake(request, "applications")))
      return reply(
        { error: "Too many submissions. Please try again in an hour." },
        429,
      );
    const b = parsed.data;
    const d = db();
    const [p] = await d
      .select()
      .from(properties)
      .where(eq(properties.id, b.propertyId));
    if (!p || !p.data.published || !p.data.acceptingApplications)
      return reply(
        { error: "This property is not accepting applications." },
        409,
      );
    if (p.revision !== b.revision || b.criteriaVersion !== POLICY.version)
      return reply(
        {
          error:
            "The listing or criteria have changed. Reload and review them before applying.",
        },
        409,
      );
    await d
      .insert(applications)
      .values({
        id: b.id,
        propertyId: p.id,
        data: b.data,
        criteriaSnapshot: selectionCriteriaText(),
        criteriaVersion: POLICY.version,
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
      503,
    );
  }
}
