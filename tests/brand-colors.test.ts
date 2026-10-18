import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  brandColorCss,
  brandColorsSchema,
  brandColorTokens,
  contrastChecks,
  defaultBrandColors,
  formatOklch,
  hexToOklch,
  normalizeColorInput,
  oklchToHex,
  parseOklch,
  resolveBrandColors,
} from "../lib/brand-colors";

const lightHex = {
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
};

test("light defaults are the brand hex values in OKLCH form", () => {
  for (const [token, hex] of Object.entries(lightHex)) {
    const value =
      defaultBrandColors.light[token as keyof typeof defaultBrandColors.light];
    const parsed = parseOklch(value);
    assert.ok(parsed, `${token} is a strict oklch value`);
    assert.equal(oklchToHex(parsed), hex, token);
  }
});

test("only the strict oklch form is accepted for saved colors", () => {
  assert.ok(parseOklch("oklch(33% 0.0518 177.36)"));
  for (const unsafe of [
    "oklch(33% 0.05 177);}body{display:none",
    "red",
    "#103e35",
    "oklch(101% 0.1 10)",
    "oklch(50% 0.6 10)",
    "oklch(50% 0.1 360)",
    "url(https://example.invalid)",
  ]) {
    assert.equal(parseOklch(unsafe), null, unsafe);
  }
});

test("typed hex and loose oklch values normalize to the strict form", () => {
  assert.equal(
    normalizeColorInput("#FFF"),
    formatOklch(hexToOklch("#ffffff") ?? { c: 0, h: 0, l: 1 })
  );
  assert.equal(
    normalizeColorInput("oklch(0.5 0.1 120deg)"),
    "oklch(50% 0.1 120)"
  );
  assert.equal(normalizeColorInput("oklch(50% 0.1 120)"), "oklch(50% 0.1 120)");
  assert.equal(normalizeColorInput("blue"), null);
  assert.equal(normalizeColorInput("oklch(50% 0.1 120); color: red"), null);
});

test("contrast checks flag low-contrast text colors against the surface", () => {
  const [danger] = contrastChecks(defaultBrandColors.light, "danger");
  assert.ok(danger.ratio < danger.minimum, "pasted danger is below 4.5:1");
  const [ink] = contrastChecks(defaultBrandColors.light, "ink");
  assert.ok(ink.ratio > 15);
  const actions = contrastChecks(defaultBrandColors.light, "actions");
  assert.deepEqual(
    actions.map((check) => check.against),
    ["surface", "button text"]
  );
  assert.deepEqual(contrastChecks(defaultBrandColors.light, "border"), []);
});

test("brand CSS overrides both themes and falls back for invalid values", () => {
  const colors = resolveBrandColors({
    dark: { ...defaultBrandColors.dark, primary: "oklch(80% 0.1 150)" },
    light: {
      ...defaultBrandColors.light,
      ink: "red;}body{display:none",
      primary: "oklch(30% 0.05 180)",
    },
  });
  assert.equal(colors.light.ink, defaultBrandColors.light.ink);
  const css = brandColorCss(colors);
  assert.ok(css.startsWith(":root:root{"));
  assert.ok(css.includes(':root:root[data-theme="dark"]{'));
  assert.ok(css.includes("--primary:oklch(30% 0.05 180);"));
  assert.ok(css.includes("--primary:oklch(80% 0.1 150);"));
  assert.ok(!css.includes("display:none"));
  for (const { token } of brandColorTokens) {
    assert.equal(css.split(`--${token}:`).length - 1, 2, token);
  }
});

test("the color schema requires every token in both palettes", () => {
  assert.equal(brandColorsSchema.safeParse(defaultBrandColors).success, true);
  const { primary: _primary, ...missing } = defaultBrandColors.light;
  assert.equal(
    brandColorsSchema.safeParse({
      dark: defaultBrandColors.dark,
      light: missing,
    }).success,
    false
  );
});

function block(css: string, selector: string) {
  // The token block is the first rule for this selector that declares --surface.
  let start = css.indexOf(`\n${selector} {`);
  while (start >= 0) {
    const body = css.slice(start, css.indexOf("}", start));
    if (body.includes("--surface:")) {
      return body;
    }
    start = css.indexOf(`\n${selector} {`, start + 1);
  }
  assert.fail(`${selector} token block exists`);
}

test("globals.css fallback colors match the brand defaults", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const [mode, selector] of [
    ["light", ":root"],
    ["dark", ':root[data-theme="dark"]'],
  ] as const) {
    const source = block(css, selector);
    for (const { token } of brandColorTokens) {
      const line = source
        .split("\n")
        .find((entry) => entry.trim().startsWith(`--${token}:`));
      assert.ok(line, `${mode} ${token} is declared`);
      const value = line.slice(line.indexOf(":") + 1).replace(";", "");
      assert.equal(
        normalizeColorInput(value),
        defaultBrandColors[mode][token],
        `${mode} ${token}`
      );
    }
  }
});
