const pattern1 = /^[0-9a-f-]{36}$/;
const pattern2 = /Choose|SVG/;

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { guard, reply } from "@/lib/adverse/auth";
import {
  type BrandColors,
  brandColorsSchema,
  resolveBrandColors,
} from "@/lib/brand-colors";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";
import { logoPng } from "@/lib/leases/branding";
export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  try {
    const rows = await db()
      .select()
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
      .limit(20);
    return reply({
      current: rows[0]
        ? { ...rows[0], colors: resolveBrandColors(rows[0].colors) }
        : null,
      history: rows.map(({ colors, logoPng: logoPngLocal, ...r }) => ({
        ...r,
        hasColors: !!colors,
        hasLogo: !!logoPngLocal,
      })),
    });
  } catch {
    return reply({ error: "Branding is unavailable." }, 503);
  }
}
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  try {
    if (Number(request.headers.get("content-length")) > 2_100_000) {
      return reply({ error: "Choose a logo under 2 MB." }, 413);
    }
    const form = await request.formData(),
      name = String(form.get("name") ?? "").trim();
    if (!name || name.length > 120) {
      return reply(
        { error: "Enter a business name under 120 characters." },
        400
      );
    }
    const d = db(),
      [previous] = await d
        .select()
        .from(brandVersions)
        .orderBy(desc(brandVersions.createdAt))
        .limit(1);
    let png = previous?.logoPng ?? null;
    let colors: BrandColors | null = previous?.colors ?? null;
    const restore = String(form.get("restore") ?? "");
    if (restore) {
      if (!pattern1.test(restore)) {
        return reply({ error: "Invalid brand version." }, 400);
      }
      const [r] = await d
        .select()
        .from(brandVersions)
        .where(eq(brandVersions.id, restore));
      if (!r) {
        return reply({ error: "Brand version not found." }, 404);
      }
      ({ colors, logoPng: png } = r);
    }
    const submittedColors = form.get("colors");
    if (typeof submittedColors === "string" && submittedColors) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(submittedColors);
      } catch {
        return reply({ error: "Brand colors could not be read." }, 400);
      }
      const result = brandColorsSchema.safeParse(parsed);
      if (!result.success) {
        return reply(
          { error: "Each brand color must be an oklch(L% C H) value." },
          400
        );
      }
      colors = result.data;
    }
    if (form.get("remove") === "true") {
      png = null;
    }
    const file = form.get("logo");
    if (file instanceof File && file.size > 2_000_000) {
      return reply({ error: "Choose a PNG or SVG under 2 MB." }, 400);
    }
    if (file instanceof File && file.size) {
      png = (
        await logoPng(Buffer.from(await file.arrayBuffer()), file.type)
      ).toString("base64");
    }
    await d
      .insert(brandVersions)
      .values({ colors, id: randomUUID(), logoPng: png, name });
    return reply({ ok: true });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error && pattern2.test(e.message)
            ? e.message
            : "Could not save branding. Try a PNG or an SVG exported as paths.",
      },
      400
    );
  }
}
