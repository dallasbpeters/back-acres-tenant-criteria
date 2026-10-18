const pattern1 = /<svg[\s>]/i;
const pattern2 = /<!DOCTYPE|<!ENTITY/i;
const pattern3 = /^#[\w-]+$/;
const pattern4 = /(?:url\s*\(|:|\\)/i;
const pattern5 = /^url\(#[\w-]+\)$/;
const pattern6 = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

import sanitize from "sanitize-html";
import sharp from "sharp";
export async function logoPng(input: Buffer, type: string) {
  if (input.length > 2_000_000 || !input.length) {
    throw new Error("Choose a PNG or SVG under 2 MB.");
  }
  let source = input;
  if (type === "image/svg+xml") {
    const raw = input.toString("utf8");
    if (!pattern1.test(raw) || pattern2.test(raw)) {
      throw new Error("Choose an SVG without external resources.");
    }
    const clean = sanitize(raw, {
      allowedAttributes: {
        "*": [
          "id",
          "href",
          "xmlns",
          "viewBox",
          "width",
          "height",
          "x",
          "y",
          "x1",
          "y1",
          "x2",
          "y2",
          "cx",
          "cy",
          "r",
          "rx",
          "ry",
          "d",
          "points",
          "fill",
          "fill-opacity",
          "fill-rule",
          "stroke",
          "stroke-width",
          "stroke-opacity",
          "stroke-linecap",
          "stroke-linejoin",
          "opacity",
          "transform",
          "gradientTransform",
          "gradientUnits",
          "offset",
          "stop-color",
          "stop-opacity",
          "clip-path",
          "font-family",
          "font-size",
          "font-weight",
          "text-anchor",
        ],
      },
      allowedTags: [
        "svg",
        "g",
        "path",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "defs",
        "linearGradient",
        "radialGradient",
        "stop",
        "clipPath",
        "title",
        "desc",
        "text",
        "tspan",
        "use",
      ],
      parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
      transformTags: {
        "*": (tagName, attribs) => {
          const {
            style,
            "xlink:href": linkedReference,
            ...attributes
          } = attribs;
          if (linkedReference && !attributes.href) {
            attributes.href = linkedReference;
          }
          // Convert safe presentation declarations rather than retaining executable CSS.
          for (const declaration of (style ?? "").split(";")) {
            const separator = declaration.indexOf(":");
            const property = declaration
              .slice(0, separator)
              .trim()
              .toLowerCase();
            if (
              separator > 0 &&
              [
                "fill",
                "fill-opacity",
                "fill-rule",
                "stroke",
                "stroke-width",
                "stroke-opacity",
                "stroke-linecap",
                "stroke-linejoin",
                "opacity",
                "stop-color",
                "stop-opacity",
                "font-family",
                "font-size",
                "font-weight",
                "text-anchor",
              ].includes(property)
            ) {
              attributes[property] = declaration.slice(separator + 1).trim();
            }
          }
          return {
            attribs: Object.fromEntries(
              Object.entries(attributes).filter(([name, value]) => {
                if (name === "href") {
                  return pattern3.test(value);
                }
                return (
                  !pattern4.test(value) ||
                  pattern5.test(value) ||
                  value === "http://www.w3.org/2000/svg"
                );
              })
            ),
            tagName,
          };
        },
      },
    });
    source = Buffer.from(clean);
  } else if (
    type !== "image/png" ||
    !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw new Error("Choose a real PNG or SVG logo.");
  }
  return await sharp(source, { animated: false, limitInputPixels: 20_000_000 })
    .resize({
      fit: "inside",
      height: 600,
      width: 1200,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
export async function signaturePng(data: string) {
  if (!pattern6.test(data) || data.length > 500_000) {
    throw new Error("Draw your signature again.");
  }
  const source = Buffer.from(data.split(",")[1], "base64");
  if (
    !source
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw new Error("Invalid signature image.");
  }
  const image = sharp(source, { animated: false, limitInputPixels: 2_000_000 });
  const { data: pixels, info } = await image
    .clone()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let marks = 0;
  for (let i = 0; i < pixels.length; i += info.channels) {
    if (
      pixels[i + 3] > 30 &&
      Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 200
    ) {
      marks += 1;
    }
  }
  if (marks < 20) {
    throw new Error("Please draw a complete signature.");
  }
  return image
    .resize({
      fit: "inside",
      height: 300,
      width: 900,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
