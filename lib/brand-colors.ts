import { z } from "zod";

// Strict `oklch(L% C H)` form. Saved values are interpolated into a <style>
// element, so nothing outside this exact numeric shape is ever accepted.
const oklchPattern =
  /^oklch\((\d{1,3}(?:\.\d{1,4})?)% (\d(?:\.\d{1,5})?) (\d{1,3}(?:\.\d{1,4})?)\)$/;
const hexPattern = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const looseOklchPattern =
  /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i;

export const brandColorTokens = [
  {
    description: "Headings, navigation and brand marks.",
    label: "Primary",
    minimumContrast: 4.5,
    token: "primary",
  },
  {
    description: "Secondary brand accents.",
    label: "Secondary",
    minimumContrast: 3,
    token: "secondary",
  },
  {
    description: "Body text.",
    label: "Ink",
    minimumContrast: 4.5,
    token: "ink",
  },
  {
    description: "Page and paper background.",
    label: "Surface",
    minimumContrast: null,
    token: "surface",
  },
  {
    description: "Buttons and links. Button text is light on this color.",
    label: "Actions",
    minimumContrast: 4.5,
    token: "actions",
  },
  {
    description: "Dividers and field borders.",
    label: "Border",
    minimumContrast: null,
    token: "border",
  },
  {
    description: "Stronger borders that must stay visible.",
    label: "Border dark",
    minimumContrast: 3,
    token: "border-dark",
  },
  {
    description: "Errors and destructive messages.",
    label: "Danger",
    minimumContrast: 4.5,
    token: "danger",
  },
  {
    description: "Warnings and cautions.",
    label: "Warning",
    minimumContrast: 4.5,
    token: "warning",
  },
  {
    description: "Highlighted labels and links.",
    label: "Accent",
    minimumContrast: 4.5,
    token: "accent",
  },
] as const;

export type BrandColorToken = (typeof brandColorTokens)[number]["token"];
export type BrandPalette = Record<BrandColorToken, string>;
export interface BrandColors {
  dark: BrandPalette;
  light: BrandPalette;
}
export interface Oklch {
  c: number;
  h: number;
  l: number;
}

/** Light text placed on the actions color (buttons). */
export const onActionColor = "#fffefa";

const round = (value: number, places: number) => Number(value.toFixed(places));

function linear(channel: number) {
  return channel <= 0.040_45
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}
function gamma(channel: number) {
  return channel <= 0.003_130_8
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Converts OKLCH to linear sRGB. Values outside 0–1 are out of gamut. */
export function oklchToLinearRgb({ c, h, l }: Oklch) {
  const radians = (h * Math.PI) / 180,
    a = c * Math.cos(radians),
    b = c * Math.sin(radians);
  const lms = [
    (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3,
    (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3,
    (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3,
  ];
  return [
    4.076_741_662_1 * lms[0] -
      3.307_711_591_3 * lms[1] +
      0.230_969_929_2 * lms[2],
    -1.268_438_004_6 * lms[0] +
      2.609_757_401_1 * lms[1] -
      0.341_319_396_5 * lms[2],
    -0.004_196_086_3 * lms[0] -
      0.703_418_614_7 * lms[1] +
      1.707_614_701 * lms[2],
  ];
}

export function inSrgbGamut(color: Oklch) {
  return oklchToLinearRgb(color).every(
    (channel) => channel >= -0.0005 && channel <= 1.0005
  );
}

export function hexToOklch(hex: string): Oklch | null {
  const match = hexPattern.exec(hex.trim());
  if (!match) {
    return null;
  }
  const digits =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  const [r, g, b] = [0, 2, 4].map((offset) =>
    linear(Number.parseInt(digits.slice(offset, offset + 2), 16) / 255)
  );
  const lms = [
    Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b),
    Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b),
    Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b),
  ];
  const l =
      0.210_454_255_3 * lms[0] +
      0.793_617_785 * lms[1] -
      0.004_072_046_8 * lms[2],
    a =
      1.977_998_495_1 * lms[0] -
      2.428_592_205 * lms[1] +
      0.450_593_709_9 * lms[2],
    bb =
      0.025_904_037_1 * lms[0] +
      0.782_771_766_2 * lms[1] -
      0.808_675_766 * lms[2];
  const c = Math.hypot(a, bb);
  const h = c < 0.0001 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { c, h, l };
}

export function oklchToHex(color: Oklch) {
  return `#${oklchToLinearRgb(color)
    .map((channel) =>
      Math.round(gamma(Math.min(1, Math.max(0, channel))) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

export function formatOklch({ c, h, l }: Oklch) {
  const lightness = round(Math.min(1, Math.max(0, l)) * 100, 2);
  const chroma = round(Math.min(0.5, Math.max(0, c)), 4);
  const hue = round(((h % 360) + 360) % 360, 2);
  return `oklch(${lightness}% ${chroma} ${hue === 360 ? 0 : hue})`;
}

/** Parses only the strict saved form. */
export function parseOklch(value: string): Oklch | null {
  const match = oklchPattern.exec(value);
  if (!match) {
    return null;
  }
  const l = Number(match[1]),
    c = Number(match[2]),
    h = Number(match[3]);
  if (l > 100 || c > 0.5 || h >= 360) {
    return null;
  }
  return { c, h, l: l / 100 };
}

/** Accepts hex or a typed `oklch()` value and returns the strict saved form. */
export function normalizeColorInput(value: string): string | null {
  const trimmed = value.trim();
  const hex = hexToOklch(trimmed);
  if (hex) {
    return formatOklch(hex);
  }
  const match = looseOklchPattern.exec(trimmed);
  if (!match) {
    return null;
  }
  const lightness = Number(match[1]) / (match[2] ? 100 : 1),
    c = Number(match[3]),
    h = Number(match[4]);
  if (
    [lightness, c, h].some(Number.isNaN) ||
    lightness > 1 ||
    c > 0.5 ||
    h > 360
  ) {
    return null;
  }
  return formatOklch({ c, h, l: lightness });
}

function luminance(color: Oklch) {
  const [r, g, b] = oklchToLinearRgb(color).map((channel) =>
    Math.min(1, Math.max(0, channel))
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two colors. */
export function contrastRatio(first: Oklch, second: Oklch) {
  const [high, low] = [luminance(first), luminance(second)].sort(
    (x, y) => y - x
  );
  return (high + 0.05) / (low + 0.05);
}

export interface ContrastCheck {
  against: string;
  minimum: number;
  ratio: number;
}

/** Contrast checks that apply to one token in a palette. */
export function contrastChecks(
  palette: BrandPalette,
  token: BrandColorToken
): ContrastCheck[] {
  const definition = brandColorTokens.find((item) => item.token === token);
  const color = parseOklch(palette[token]),
    surface = parseOklch(palette.surface);
  if (!(definition?.minimumContrast && color && surface)) {
    return [];
  }
  const checks = [
    {
      against: "surface",
      minimum: definition.minimumContrast,
      ratio: contrastRatio(color, surface),
    },
  ];
  const onAction = hexToOklch(onActionColor);
  if (token === "actions" && onAction) {
    checks.push({
      against: "button text",
      minimum: 4.5,
      ratio: contrastRatio(color, onAction),
    });
  }
  return checks;
}

function paletteFrom(values: Record<BrandColorToken, string>): BrandPalette {
  return Object.fromEntries(
    Object.entries(values).map(([token, value]) => [
      token,
      normalizeColorInput(value) ?? value,
    ])
  ) as BrandPalette;
}

export const defaultBrandColors: BrandColors = {
  dark: paletteFrom({
    accent: "#9bcbb1",
    actions: "#166de7",
    border: "#3a3a3a",
    "border-dark": "#646e51",
    danger: "oklch(77% 0.12 30)",
    ink: "#fffefa",
    primary: "#9bcbb1",
    secondary: "#b8be57",
    surface: "#0e1005",
    warning: "oklch(82% 0.09 75)",
  }),
  light: paletteFrom({
    accent: "#18a887",
    actions: "#166de7",
    border: "#e6e5df",
    "border-dark": "#646e51",
    danger: "#ff7141",
    ink: "#0e1005",
    primary: "#103e35",
    secondary: "#9da328",
    surface: "#fffefa",
    warning: "#f0b03e",
  }),
};

const colorValue = z.string().refine((value) => parseOklch(value) !== null, {
  message: "Use an oklch(L% C H) color.",
});
const paletteSchema = z.object(
  Object.fromEntries(
    brandColorTokens.map(({ token }) => [token, colorValue])
  ) as Record<BrandColorToken, typeof colorValue>
);
export const brandColorsSchema = z.object({
  dark: paletteSchema,
  light: paletteSchema,
});

/** Saved colors, with defaults filling any token added after they were saved. */
export function resolveBrandColors(saved: unknown): BrandColors {
  const value =
    saved && typeof saved === "object"
      ? (saved as Partial<Record<keyof BrandColors, unknown>>)
      : {};
  const merge = (mode: keyof BrandColors) => {
    const palette =
      value[mode] && typeof value[mode] === "object"
        ? (value[mode] as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      brandColorTokens.map(({ token }) => {
        const candidate = palette[token];
        return [
          token,
          typeof candidate === "string" && parseOklch(candidate)
            ? candidate
            : defaultBrandColors[mode][token],
        ];
      })
    ) as BrandPalette;
  };
  return { dark: merge("dark"), light: merge("light") };
}

function declarations(palette: BrandPalette) {
  return brandColorTokens
    .map(({ token }) => `--${token}:${palette[token]};`)
    .join("");
}

/**
 * CSS for the saved palette. The doubled :root raises specificity above
 * globals.css, so the saved colors win whatever order the styles load in.
 */
export function brandColorCss(colors: BrandColors) {
  const resolved = resolveBrandColors(colors);
  return `:root:root{${declarations(resolved.light)}}:root:root[data-theme="dark"]{${declarations(resolved.dark)}}`;
}
