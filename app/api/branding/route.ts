import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";
import { reply } from "@/lib/adverse/auth";
export async function GET() {
  try {
    const [brand] = await db()
      .select({
        id: brandVersions.id,
        name: brandVersions.name,
        logo: brandVersions.logoPng,
      })
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
      .limit(1);
    return reply({
      name: brand?.name ?? "Back Acres",
      hasLogo: !!brand?.logo,
      revision: brand?.id ?? "",
    });
  } catch {
    return reply({ name: "Back Acres", hasLogo: false, revision: "" });
  }
}
