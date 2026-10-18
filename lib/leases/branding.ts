import sharp from "sharp";
import sanitize from "sanitize-html";
export async function logoPng(input: Buffer, type: string) {
  if (input.length > 2_000_000 || !input.length)
    throw Error("Choose a PNG or SVG under 2 MB.");
  let source = input;
  if (type === "image/svg+xml") {
    const raw = input.toString("utf8");
    if (!/<svg[\s>]/i.test(raw) || /<!DOCTYPE|<!ENTITY/i.test(raw))
      throw Error("Choose an SVG without external resources.");
    const clean = sanitize(raw, {
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
      parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
      transformTags: {
        "*": (tagName, attribs) => {
          const {
            style,
            "xlink:href": linkedReference,
            ...attributes
          } = attribs;
          if (linkedReference && !attributes.href)
            attributes.href = linkedReference;
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
            )
              attributes[property] = declaration.slice(separator + 1).trim();
          }
          return {
            tagName,
            attribs: Object.fromEntries(
              Object.entries(attributes).filter(([name, value]) => {
                if (name === "href") return /^#[\w-]+$/.test(value);
                return (
                  !/(?:url\s*\(|:|\\)/i.test(value) ||
                  /^url\(#[\w-]+\)$/.test(value) ||
                  value === "http://www.w3.org/2000/svg"
                );
              }),
            ),
          };
        },
      },
    });
    source = Buffer.from(clean);
  } else if (
    type !== "image/png" ||
    !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Choose a real PNG or SVG logo.");
  return sharp(source, { limitInputPixels: 20_000_000, animated: false })
    .resize({
      width: 1200,
      height: 600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
export async function signaturePng(data: string) {
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) ||
    data.length > 500_000
  )
    throw Error("Draw your signature again.");
  const source = Buffer.from(data.split(",")[1], "base64");
  if (
    !source
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Invalid signature image.");
  const image = sharp(source, { limitInputPixels: 2_000_000, animated: false });
  const { data: pixels, info } = await image
    .clone()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let marks = 0;
  for (let i = 0; i < pixels.length; i += info.channels)
    if (
      pixels[i + 3] > 30 &&
      Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 200
    )
      marks++;
  if (marks < 20) throw Error("Please draw a complete signature.");
  return image
    .resize({
      width: 900,
      height: 300,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
