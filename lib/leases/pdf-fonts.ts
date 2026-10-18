import path from "node:path";
import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument } from "pdf-lib";

const fontFiles = [
  path.join(
    process.cwd(),
    "public/pdf-assets/fonts",
    "source-serif-4-latin-400-normal.woff",
  ),
  path.join(
    process.cwd(),
    "public/pdf-assets/fonts",
    "source-serif-4-latin-600-normal.woff",
  ),
  path.join(
    process.cwd(),
    "public/pdf-assets/fonts",
    "source-serif-4-latin-400-italic.woff",
  ),
  path.join(
    process.cwd(),
    "public/pdf-assets/fonts",
    "source-serif-4-latin-600-italic.woff",
  ),
  path.join(
    process.cwd(),
    "public/pdf-assets/fonts",
    "public-sans-latin-400-normal.woff",
  ),
  path.join(
    process.cwd(),
    "public/pdf-assets/fonts",
    "public-sans-latin-600-normal.woff",
  ),
];
let files: Promise<Buffer[]> | undefined;
export async function leaseFonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  const bytes = await (files ??= Promise.all(
    fontFiles.map((file) => readFile(file)),
  ));
  const [normal, bold, italic, boldItalic, label, labelBold] =
    await Promise.all(
      bytes.map((data) => pdf.embedFont(data, { subset: true })),
    );
  return { normal, bold, italic, boldItalic, label, labelBold };
}
