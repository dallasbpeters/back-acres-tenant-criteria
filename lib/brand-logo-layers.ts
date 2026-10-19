import sharp from "sharp";
import {
  type BrandColorToken,
  type BrandPalette,
  hexToOklch,
  type Oklch,
  parseOklch,
} from "@/lib/brand-colors";

/** Brand colors a logo color may map to; each has a light and a dark value. */
const LOGO_TOKENS: BrandColorToken[] = [
  "primary",
  "secondary",
  "accent",
  "ink",
  "surface",
  "actions",
];
/** At most this many logo colors; anti-aliased edges join the nearest one. */
const MAX_COLORS = 6;
/** OKLab distance under which two colors count as the same logo color. */
const SAME_COLOR = 0.06;

export interface LogoLayer {
  /** The logo color this layer had in the upload, as #rrggbb. */
  color: string;
  /** Alpha mask PNG: white where this color appears. */
  mask: Buffer;
  /** Brand color token that paints this layer, e.g. "primary". */
  token: BrandColorToken;
}

const lab = ({ c, h, l }: Oklch) => {
  const radians = (h * Math.PI) / 180;
  return [l, c * Math.cos(radians), c * Math.sin(radians)] as const;
};
const distance = (a: Oklch, b: Oklch) => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};
const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const toOklch = (value: string) =>
  parseOklch(value) ?? hexToOklch(value) ?? { c: 0, h: 0, l: 0 };

/** Finds the logo's main colors from its fully opaque pixels. */
function mainColors(pixels: Buffer, channels: number) {
  const counts = new Map<string, { count: number; rgb: number[] }>();
  for (let i = 0; i < pixels.length; i += channels) {
    if (pixels[i + 3] < 250) {
      continue;
    }
    // Round to 16 steps per channel so near-identical pixels share a bucket.
    const key = `${Math.floor(pixels[i] / 16)}-${Math.floor(pixels[i + 1] / 16)}-${Math.floor(pixels[i + 2] / 16)}`;
    const bucket = counts.get(key);
    if (bucket) {
      bucket.count += 1;
    } else {
      counts.set(key, {
        count: 1,
        rgb: [pixels[i], pixels[i + 1], pixels[i + 2]],
      });
    }
  }
  const total = [...counts.values()].reduce((sum, b) => sum + b.count, 0);
  const colors: { color: Oklch; hex: string }[] = [];
  for (const bucket of [...counts.values()].sort((a, b) => b.count - a.count)) {
    // Ignore specks under 0.5% of the logo.
    if (bucket.count / total < 0.005 || colors.length >= MAX_COLORS) {
      break;
    }
    const value = hex(bucket.rgb[0], bucket.rgb[1], bucket.rgb[2]);
    const color = toOklch(value);
    if (!colors.some((known) => distance(known.color, color) < SAME_COLOR)) {
      colors.push({ color, hex: value });
    }
  }
  return colors;
}

/** The brand token whose light-mode color is closest to a logo color. */
export function nearestToken(color: Oklch, light: BrandPalette) {
  let best: BrandColorToken = "primary";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const token of LOGO_TOKENS) {
    const d = distance(color, toOklch(light[token]));
    if (d < bestDistance) {
      best = token;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Splits a logo PNG into one mask per main color and maps each color to the
 * nearest brand color. Painting each mask with its brand color variable
 * redraws the logo in light mode and adapts it in dark mode.
 */
export async function logoLayers(
  png: Buffer,
  light: BrandPalette
): Promise<{ height: number; layers: LogoLayer[]; width: number }> {
  const { data, info } = await sharp(png, { limitInputPixels: 20_000_000 })
    .resize({
      fit: "inside",
      height: 256,
      width: 256,
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = mainColors(data, info.channels).map((entry) => ({
    ...entry,
    token: nearestToken(entry.color, light),
  }));
  // One layer per brand token: blended edge colors join their main color.
  const tokens = [...new Set(colors.map((entry) => entry.token))];
  const layerOf = colors.map((entry) => tokens.indexOf(entry.token));
  const masks = tokens.map(() => Buffer.alloc(info.width * info.height * 4));
  for (let i = 0, p = 0; i < data.length; i += info.channels, p += 4) {
    const alpha = data[i + 3];
    if (!(alpha && colors.length)) {
      continue;
    }
    const color = toOklch(hex(data[i], data[i + 1], data[i + 2]));
    let nearest = 0;
    for (let k = 1; k < colors.length; k += 1) {
      if (
        distance(color, colors[k].color) <
        distance(color, colors[nearest].color)
      ) {
        nearest = k;
      }
    }
    const mask = masks[layerOf[nearest]];
    mask.fill(255, p, p + 3);
    mask[p + 3] = alpha;
  }
  const layers = await Promise.all(
    tokens.map(async (token, k) => ({
      color: colors[layerOf.indexOf(k)].hex,
      mask: await sharp(masks[k], {
        raw: { channels: 4, height: info.height, width: info.width },
      })
        .png()
        .toBuffer(),
      token,
    }))
  );
  return { height: info.height, layers, width: info.width };
}
