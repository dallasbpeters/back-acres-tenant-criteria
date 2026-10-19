import { desc } from "drizzle-orm";
import { reply } from "@/lib/adverse/auth";
import { brandLogoLayers } from "@/lib/brand-logo-cache";
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
    // Color layers let the logo follow the brand colors in dark mode. If
    // splitting fails, the page falls back to the plain logo image.
    const layers =
      brand?.logo &&
      (await brandLogoLayers(brand.id).catch(() => null))?.layers.map(
        (layer) => layer.token
      );
    return reply({
      hasLogo: !!brand?.logo,
      logoLayers: layers || [],
      name: brand?.name ?? "Back Acres",
      revision: brand?.id ?? "",
    });
  } catch {
    return reply({ hasLogo: false, name: "Back Acres", revision: "" });
  }
}
