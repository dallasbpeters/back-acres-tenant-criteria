import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import {
  listingPhotos,
  listingPublications,
  properties,
} from "@/lib/db/schema";
import { listingDigest } from "@/lib/management/listing-digest";
import { notRemoved } from "@/lib/management/not-removed";
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const parsed = z
    .object({
      propertyId: z.string().uuid(),
      provider: z.enum(["zillow", "avail", "apartments"]),
      status: z.enum(["not_started", "submitted", "live", "removed"]),
    })
    .safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) {
    return reply({ error: "Choose a listing website and status." }, 400);
  }
  try {
    const b = parsed.data,
      d = db();
    const [property] = await d
      .select()
      .from(properties)
      .where(and(eq(properties.id, b.propertyId), notRemoved(properties.id)));
    if (!property) {
      return reply({ error: "Property not found." }, 404);
    }
    const photos = await d
      .select({ caption: listingPhotos.caption, id: listingPhotos.id })
      .from(listingPhotos)
      .where(
        and(
          eq(listingPhotos.propertyId, b.propertyId),
          eq(listingPhotos.archived, false)
        )
      )
      .orderBy(asc(listingPhotos.position), asc(listingPhotos.createdAt));
    const values = {
      ...b,
      contentDigest: listingDigest(property.data, photos),
      id: randomUUID(),
      updatedAt: new Date(),
    };
    await d
      .insert(listingPublications)
      .values(values)
      .onConflictDoUpdate({
        set: {
          contentDigest: values.contentDigest,
          status: b.status,
          updatedAt: values.updatedAt,
        },
        target: [listingPublications.propertyId, listingPublications.provider],
      });
    return reply({ ok: true });
  } catch {
    return reply({ error: "Could not save publishing status." }, 503);
  }
}
