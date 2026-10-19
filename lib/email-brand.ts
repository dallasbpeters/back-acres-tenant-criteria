import "server-only";
import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandVersions } from "@/lib/db/schema";
import { siteUrl } from "@/lib/management/security";
import {
  contrastRatio,
  hexToOklch,
  oklchToHex,
  parseOklch,
  resolveBrandColors,
} from "./brand-colors";
import { defaultEmailBrand, type EmailBrand } from "./email-layout";

/** Brand primary as hex, with whichever text color reads better on it. */
function emailColors(saved: unknown) {
  const primary = parseOklch(resolveBrandColors(saved).light.primary);
  const white = hexToOklch("#ffffff");
  const ink = hexToOklch("#0e1005");
  if (!(primary && white && ink)) {
    return {
      buttonInk: defaultEmailBrand.buttonInk,
      color: defaultEmailBrand.color,
    };
  }
  return {
    buttonInk:
      contrastRatio(primary, white) >= contrastRatio(primary, ink)
        ? "#ffffff"
        : "#0e1005",
    color: oklchToHex(primary),
  };
}

/**
 * Loads the saved branding for outgoing email. The logo URL names the brand
 * version, so a sent email keeps the logo it was sent with. Email must still
 * send when branding cannot load, so failures fall back to the default name.
 */
export async function currentEmailBrand(name?: string): Promise<EmailBrand> {
  try {
    const [brand] = await db()
      .select({
        colors: brandVersions.colors,
        hasLogo: sql<boolean>`${brandVersions.logoPng} is not null`,
        id: brandVersions.id,
        name: brandVersions.name,
      })
      .from(brandVersions)
      .orderBy(desc(brandVersions.createdAt))
      .limit(1);
    return {
      ...emailColors(brand?.colors),
      logoUrl: brand?.hasLogo
        ? new URL(
            `/api/branding/logo?v=${encodeURIComponent(brand.id)}`,
            siteUrl()
          ).toString()
        : null,
      name: name ?? brand?.name ?? defaultEmailBrand.name,
    };
  } catch {
    return { ...defaultEmailBrand, name: name ?? defaultEmailBrand.name };
  }
}
