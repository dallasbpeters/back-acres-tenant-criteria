import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";
export async function GET() {
  try {
    const [brand] = await db()
      .select()
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
      .limit(1);
    if (!brand?.logoPng) return new Response(null, { status: 404 });
    return new Response(Buffer.from(brand.logoPng, "base64"), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
