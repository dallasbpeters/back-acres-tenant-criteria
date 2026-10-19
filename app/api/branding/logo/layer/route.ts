import type { NextRequest } from "next/server";
import { brandLogoLayers } from "@/lib/brand-logo-cache";

const versionPattern = /^[0-9a-f-]{36}$/;
const indexPattern = /^\d{1,2}$/;

/** One color mask of the logo, painted with a brand color by the page. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const version = params.get("v") ?? "";
  const index = params.get("i") ?? "";
  if (!(versionPattern.test(version) && indexPattern.test(index))) {
    return new Response(null, { status: 404 });
  }
  try {
    const layer = (await brandLogoLayers(version))?.layers[Number(index)];
    if (!layer) {
      return new Response(null, { status: 404 });
    }
    return new Response(new Uint8Array(layer.mask), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
