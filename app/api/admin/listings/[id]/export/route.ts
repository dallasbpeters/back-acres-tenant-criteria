import { get } from "@vercel/blob";
import { and, asc, eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { guard, reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
import { listingText } from "@/lib/management/listings";
import { notRemoved } from "@/lib/management/not-removed";
import { siteUrl } from "@/lib/management/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return reply({ error: "Invalid property." }, 400);
  }
  try {
    const d = db(),
      [property] = await d
        .select()
        .from(properties)
        .where(and(eq(properties.id, id), notRemoved(properties.id)));
    if (!property) {
      return reply({ error: "Property not found." }, 404);
    }
    const photos = await d
      .select()
      .from(listingPhotos)
      .where(
        and(eq(listingPhotos.propertyId, id), eq(listingPhotos.archived, false))
      )
      .orderBy(asc(listingPhotos.position), asc(listingPhotos.createdAt));
    const files: Record<string, Uint8Array> = {
      "listing.txt": strToU8(
        listingText(property.data, property.slug, siteUrl())
      ),
      "photo-captions.txt": strToU8(
        photos
          .map(
            (p, i) =>
              `${String(i + 1).padStart(2, "0")}. ${p.caption || "Property photo"}`
          )
          .join("\n")
      ),
      "READ-ME.txt": strToU8(
        "This is a listing preparation package. Nothing has been submitted to a listing website.\nUpload these photos in numerical order; the first is the cover. Review rent, address, availability and description in each provider account before publishing.\nAvailability and pricing changes are not automatically synchronized. Public listing and application links work only while the listing is published in Back Acres.\n"
      ),
    };
    for (const [i, photo] of photos.entries()) {
      const result =
        /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await get(
          photo.blobPath,
          { access: "private" }
        );
      if (!result?.stream) {
        throw new Error("Photo unavailable");
      }
      files[`photos/${String(i + 1).padStart(2, "0")}-${photo.id}.jpg`] =
        new Uint8Array(await new Response(result.stream).arrayBuffer());
    }
    const archive = zipSync(files, { level: 0 });
    return new Response(
      new ReadableStream({
        start(controller) {
          for (let n = 0; n < archive.length; n += 64 * 1024) {
            controller.enqueue(archive.slice(n, n + 64 * 1024));
          }
          controller.close();
        },
      }),
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${property.slug}-listing.zip"`,
          "Content-Type": "application/zip",
        },
      }
    );
  } catch {
    return reply(
      { error: "Could not prepare the listing package. Please retry." },
      503
    );
  }
}
