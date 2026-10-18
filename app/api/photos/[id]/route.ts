import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticated } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const [row] = await db()
      .select({ photo: listingPhotos, property: properties })
      .from(listingPhotos)
      .innerJoin(properties, eq(listingPhotos.propertyId, properties.id))
      .where(eq(listingPhotos.id, id));
    if (
      !row ||
      ((row.photo.archived || !row.property.data.published) &&
        !(await authenticated()))
    ) {
      return new Response("Not found", { status: 404 });
    }
    const result = await get(row.photo.blobPath, { access: "private" });
    if (!result?.stream) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(result.stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="listing-photo-${id}.jpg"`,
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Photo unavailable", { status: 503 });
  }
}
