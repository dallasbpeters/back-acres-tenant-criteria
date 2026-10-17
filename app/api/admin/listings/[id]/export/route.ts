import { NextRequest } from "next/server";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { zipSync, strToU8 } from "fflate";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
import { guard, reply } from "@/lib/adverse/auth";
import { siteUrl } from "@/lib/management/security";
import { listingText } from "@/lib/management/listings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard(request);
  if (denied) return denied;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return reply({ error: "Invalid property." }, 400);
  try {
    const d = db(),
      [property] = await d
        .select()
        .from(properties)
        .where(eq(properties.id, id));
    if (!property) return reply({ error: "Property not found." }, 404);
    const photos = await d
      .select()
      .from(listingPhotos)
      .where(
        and(
          eq(listingPhotos.propertyId, id),
          eq(listingPhotos.archived, false),
        ),
      )
      .orderBy(asc(listingPhotos.position), asc(listingPhotos.createdAt));
    const files: Record<string, Uint8Array> = {
      "listing.txt": strToU8(
        listingText(property.data, property.slug, siteUrl()),
      ),
      "READ-ME.txt": strToU8(
        "This is a listing preparation package. Nothing has been submitted to a listing website.\nUpload these photos in numerical order; the first is the cover. Review rent, address, availability and description in each provider account before publishing.\nAvailability and pricing changes are not automatically synchronized. Public listing and application links work only while the listing is published in Back Acres.\n",
      ),
      "photo-captions.txt": strToU8(
        photos
          .map(
            (p, i) =>
              `${String(i + 1).padStart(2, "0")}. ${p.caption || "Property photo"}`,
          )
          .join("\n"),
      ),
    };
    for (const [i, photo] of photos.entries()) {
      const result = await get(photo.blobPath, { access: "private" });
      if (!result?.stream) throw Error("Photo unavailable");
      files[`photos/${String(i + 1).padStart(2, "0")}-${photo.id}.jpg`] =
        new Uint8Array(await new Response(result.stream).arrayBuffer());
    }
    const archive = zipSync(files, { level: 0 });
    return new Response(
      new ReadableStream({
        start(controller) {
          for (let n = 0; n < archive.length; n += 64 * 1024)
            controller.enqueue(archive.slice(n, n + 64 * 1024));
          controller.close();
        },
      }),
      {
        headers: {
          "Content-Type": "application/zip",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${property.slug}-listing.zip"`,
        },
      },
    );
  } catch {
    return reply(
      { error: "Could not prepare the listing package. Please retry." },
      503,
    );
  }
}
