"use strict";
// Keep PDF rendering local: no lease content or fonts go to a third-party viewer.
const fs = require("node:fs"),
  path = require("node:path");
// pdfjs-dist is react-pdf's dependency. Resolve it through react-pdf so the
// copied fonts and wasm always match the viewer version it loads.
const root = path.dirname(
  require.resolve("pdfjs-dist/package.json", {
    paths: [path.dirname(require.resolve("react-pdf/package.json"))],
  })
);
for (const directory of ["standard_fonts", "wasm"]) {
  const target = path.join("public", "pdf-assets", directory);
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(root, directory), target, { recursive: true });
}

const fontTarget = path.join("public", "pdf-assets", "fonts");
fs.mkdirSync(fontTarget, { recursive: true });
for (const [family, weights] of [
  [
    "source-serif-4",
    [
      [400, "normal"],
      [600, "normal"],
      [400, "italic"],
      [600, "italic"],
    ],
  ],
  [
    "public-sans",
    [
      [400, "normal"],
      [600, "normal"],
    ],
  ],
]) {
  fs.copyFileSync(
    path.join(
      path.dirname(require.resolve(`@fontsource/${family}/package.json`)),
      "LICENSE"
    ),
    path.join(fontTarget, `${family}-LICENSE.txt`)
  );
  for (const [weight, style] of weights) {
    const name = `${family}-latin-${weight}-${style}.woff`;
    fs.copyFileSync(
      require.resolve(`@fontsource/${family}/files/${name}`),
      path.join(fontTarget, name)
    );
  }
}
