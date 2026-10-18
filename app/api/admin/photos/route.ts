import { notRemoved } from "@/lib/management/not-removed";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
import { guard, reply, readBody } from "@/lib/adverse/auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  if (Number(request.headers.get("content-length") || 0) > 4_200_000)
    return reply(
      { error: "Photo is too large. Please choose an image under 4 MB." },
      413,
    );
  try {
    const form = await request.formData(),
      propertyId = z.string().uuid().parse(form.get("propertyId")),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 4_000_000 ||
      !file.size
    )
      return reply(
        { error: "Choose a JPEG, PNG, or WebP photo under 4 MB." },
        400,
      );
    const d = db(),
      [property] = await d
        .select()
        .from(properties)
        .where(and(eq(properties.id, propertyId), notRemoved(properties.id)));
    if (!property)
      return reply({ error: "Save the property before adding photos." }, 404);
    const photos = await d
      .select({ id: listingPhotos.id, position: listingPhotos.position })
      .from(listingPhotos)
      .where(
        and(
          eq(listingPhotos.propertyId, propertyId),
          eq(listingPhotos.archived, false),
        ),
      );
    if (photos.length >= 24)
      return reply(
        {
          error:
            "A listing can have up to 24 photos. Remove one before adding another.",
        },
        409,
      );
    const input = Buffer.from(await file.arrayBuffer());
    const jpeg =
      input.length > 3 &&
      input[0] === 0xff &&
      input[1] === 0xd8 &&
      input[2] === 0xff;
    const png = input
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      input.subarray(0, 4).toString() === "RIFF" &&
      input.subarray(8, 12).toString() === "WEBP";
    if (!(jpeg || png || webp))
      return reply({ error: "Choose a real JPEG, PNG, or WebP image." }, 400);
    let bytes: Buffer;
    try {
      bytes = await sharp(input, {
        limitInputPixels: 40_000_000,
        animated: false,
      })
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      return reply(
        {
          error:
            "This image could not be read. Choose a JPEG, PNG, or WebP photo.",
        },
        400,
      );
    }
    const id = randomUUID(),
      path = `listing-photos/${propertyId}/${id}.jpg`;
    await put(path, bytes, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
    });
    await d.insert(listingPhotos).values({
      id,
      propertyId,
      blobPath: path,
      position: Math.max(-1, ...photos.map((p) => p.position)) + 1,
    });
    return reply({ id, url: `/api/photos/${id}` }, 201);
  } catch {
    return reply({ error: "Photo upload failed. Please try again." }, 503);
  }
}
const change = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("caption"),
    id: z.string().uuid(),
    caption: z.string().trim().max(300),
  }),
  z.object({
    action: z.literal("archive"),
    id: z.string().uuid(),
    archived: z.boolean(),
  }),
  z.object({
    action: z.literal("order"),
    propertyId: z.string().uuid(),
    ids: z.array(z.string().uuid()).min(1).max(24),
  }),
]);
export async function PATCH(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = change.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) return reply({ error: "Invalid photo change." }, 400);
  try {
    const c = parsed.data,
      d = db();
    if (c.action === "order") {
      const active = await d
        .select({ id: listingPhotos.id })
        .from(listingPhotos)
        .where(
          and(
            eq(listingPhotos.propertyId, c.propertyId),
            eq(listingPhotos.archived, false),
          ),
        )
        .orderBy(asc(listingPhotos.position));
      if (
        new Set(c.ids).size !== c.ids.length ||
        active.length !== c.ids.length ||
        active.some((p) => !c.ids.includes(p.id))
      )
        return reply(
          { error: "Photos changed. Reload before reordering." },
          409,
        );
      const [first, ...rest] = c.ids.map((id, position) =>
        d
          .update(listingPhotos)
          .set({ position })
          .where(
            and(
              eq(listingPhotos.id, id),
              eq(listingPhotos.propertyId, c.propertyId),
            ),
          ),
      );
      if (first) await d.batch([first, ...rest]);
    } else {
      const [photo] = await d
        .select()
        .from(listingPhotos)
        .where(eq(listingPhotos.id, c.id));
      if (!photo) return reply({ error: "Photo not found." }, 404);
      if (c.action === "archive" && !c.archived) {
        const active = await d
          .select({ id: listingPhotos.id })
          .from(listingPhotos)
          .where(
            and(
              eq(listingPhotos.propertyId, photo.propertyId),
              eq(listingPhotos.archived, false),
            ),
          );
        if (active.length >= 24)
          return reply(
            { error: "Remove a photo before restoring another." },
            409,
          );
      }
      await d
        .update(listingPhotos)
        .set(
          c.action === "caption"
            ? { caption: c.caption }
            : { archived: c.archived },
        )
        .where(eq(listingPhotos.id, c.id));
    }
    return reply({ ok: true });
  } catch {
    return reply({ error: "Could not save photo changes." }, 503);
  }
}
