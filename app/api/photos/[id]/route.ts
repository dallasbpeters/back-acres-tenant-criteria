import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
import { authenticated } from "@/lib/adverse/auth";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });
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
    )
      return new Response("Not found", { status: 404 });
    const result = await get(row.photo.blobPath, { access: "private" });
    if (!result?.stream) return new Response("Not found", { status: 404 });
    return new Response(result.stream, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="listing-photo-${id}.jpg"`,
      },
    });
  } catch {
    return new Response("Photo unavailable", { status: 503 });
  }
}
