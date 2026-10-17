import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  listingPhotos,
  listingPublications,
  properties,
} from "@/lib/db/schema";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { listingDigest } from "@/lib/management/listing-digest";
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = z
    .object({
      propertyId: z.string().uuid(),
      provider: z.enum(["zillow", "avail", "apartments"]),
      status: z.enum(["not_started", "submitted", "live", "removed"]),
    })
    .safeParse(await readBody(request).catch(() => null));
  if (!parsed.success)
    return reply({ error: "Choose a listing website and status." }, 400);
  try {
    const b = parsed.data,
      d = db();
    const [property] = await d
      .select()
      .from(properties)
      .where(eq(properties.id, b.propertyId));
    if (!property) return reply({ error: "Property not found." }, 404);
    const photos = await d
      .select({ id: listingPhotos.id, caption: listingPhotos.caption })
      .from(listingPhotos)
      .where(
        and(
          eq(listingPhotos.propertyId, b.propertyId),
          eq(listingPhotos.archived, false),
        ),
      )
      .orderBy(asc(listingPhotos.position), asc(listingPhotos.createdAt));
    const values = {
      ...b,
      id: randomUUID(),
      contentDigest: listingDigest(property.data, photos),
      updatedAt: new Date(),
    };
    await d
      .insert(listingPublications)
      .values(values)
      .onConflictDoUpdate({
        target: [listingPublications.propertyId, listingPublications.provider],
        set: {
          status: b.status,
          contentDigest: values.contentDigest,
          updatedAt: values.updatedAt,
        },
      });
    return reply({ ok: true });
  } catch {
    return reply({ error: "Could not save publishing status." }, 503);
  }
}
