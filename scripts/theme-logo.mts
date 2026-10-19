// Splits a logo into brand-color layers and writes a light/dark preview.
// Usage: npx tsx --tsconfig tsconfig.json scripts/theme-logo.mts <logo.png> [out-dir]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultBrandColors } from "@/lib/brand-colors";
import { logoLayers } from "@/lib/brand-logo-layers";

const [input, outDir = "tmp/theme-logo"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: scripts/theme-logo.mts <logo.png> [out-dir]");
  process.exit(1);
}
const { height, layers, width } = await logoLayers(
  readFileSync(input),
  defaultBrandColors.light
);
mkdirSync(outDir, { recursive: true });
for (const [index, layer] of layers.entries()) {
  writeFileSync(path.join(outDir, `layer-${index}.png`), layer.mask);
  console.log(`layer-${index}.png  ${layer.color} -> var(--${layer.token})`);
}
const logo = layers
  .map(
    (layer, index) =>
      `<span style="background:var(--${layer.token});mask-image:url(layer-${index}.png)"></span>`
  )
  .join("");
const theme = (mode: "dark" | "light") =>
  Object.entries(defaultBrandColors[mode])
    .map(([token, value]) => `--${token}:${value}`)
    .join(";");
writeFileSync(
  path.join(outDir, "preview.html"),
  `<!doctype html><meta charset=utf-8><title>Logo preview</title>
<style>
body{margin:0;display:flex;font-family:sans-serif}
section{flex:1;padding:2rem;background:var(--surface);color:var(--ink)}
.logo{position:relative;display:block;width:12rem;aspect-ratio:${width}/${height}}
.logo span{position:absolute;inset:0;mask-size:contain;mask-repeat:no-repeat;mask-position:center}
</style>
<section style="${theme("light")}"><p>Light</p><span class=logo>${logo}</span></section>
<section style="${theme("dark")}"><p>Dark</p><span class=logo>${logo}</span></section>`
);
console.log(`Preview: ${path.join(outDir, "preview.html")}`);
