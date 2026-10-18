import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";

const versionPattern = /^[0-9a-f-]{36}$/;

export async function GET(request: NextRequest) {
  try {
    // Emails name a brand version so they keep the logo they were sent with.
    const version = request.nextUrl.searchParams.get("v") ?? "";
    const pinned = versionPattern.test(version);
    const query = db().select().from(brandVersions);
    const [brand] = pinned
      ? await query.where(eq(brandVersions.id, version)).limit(1)
      : await query.orderBy(desc(brandVersions.createdAt)).limit(1);
    if (!brand?.logoPng) {
      return new Response(null, { status: 404 });
    }
    return new Response(Buffer.from(brand.logoPng, "base64"), {
      headers: {
        "Cache-Control": pinned
          ? "public, max-age=31536000, immutable"
          : "no-store",
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
