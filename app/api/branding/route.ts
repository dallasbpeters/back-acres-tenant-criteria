import { desc } from "drizzle-orm";
import { reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";
export async function GET() {
  try {
    const [brand] = await db()
      .select({
        id: brandVersions.id,
        logo: brandVersions.logoPng,
        name: brandVersions.name,
      })
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
      .limit(1);
    return reply({
      hasLogo: !!brand?.logo,
      name: brand?.name ?? "Back Acres",
      revision: brand?.id ?? "",
    });
  } catch {
    return reply({ hasLogo: false, name: "Back Acres", revision: "" });
  }
}
