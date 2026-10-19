import "server-only";
import { eq } from "drizzle-orm";
import { resolveBrandColors } from "@/lib/brand-colors";
import { logoLayers } from "@/lib/brand-logo-layers";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";

type Layers = Awaited<ReturnType<typeof logoLayers>>;
// Brand versions never change, so layers are cached per version.
const cache = new Map<string, Promise<Layers | null>>();

/** Logo color layers for one brand version, or null when it has no logo. */
export function brandLogoLayers(version: string) {
  let entry = cache.get(version);
  if (!entry) {
    entry = (async () => {
      const [brand] = await db()
        .select({ colors: brandVersions.colors, logo: brandVersions.logoPng })
        .from(brandVersions)
        .where(eq(brandVersions.id, version))
        .limit(1);
      return brand?.logo
        ? await logoLayers(
            Buffer.from(brand.logo, "base64"),
            resolveBrandColors(brand.colors).light
          )
        : null;
    })();
    entry.catch(() => cache.delete(version));
    cache.set(version, entry);
  }
  return entry;
}
