import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";
import { brandColorCss, defaultBrandColors } from "./brand-colors";

/** CSS for the current brand palette; pages still render with defaults on failure. */
export async function currentBrandColorCss() {
  try {
    const [brand] = await db()
      .select({ colors: brandVersions.colors })
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
      .limit(1);
    return brandColorCss(brand?.colors ?? defaultBrandColors);
  } catch {
    return brandColorCss(defaultBrandColors);
  }
}
