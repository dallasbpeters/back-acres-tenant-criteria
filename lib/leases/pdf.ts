import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { documentLines, type LeaseNode, type LeaseRun } from "./document";
export async function leasePdf(
  body: string,
  reference: string,
  document?: LeaseNode | null,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Residential lease draft");
  pdf.setSubject("Owner review required before execution");
  const normal = await pdf.embedFont(StandardFonts.TimesRoman),
    bold = await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic = await pdf.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  let page = pdf.addPage([612, 792]),
    y = 728;
  const sanitize = (text: string) =>
    text.replace(
      /[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g,
      " ",
    );
  function newPage() {
    page = pdf.addPage([612, 792]);
    y = 728;
  }
  const lines = document
    ? documentLines(document)
    : body
        .split("\n")
        .map((text) => ({ runs: [{ text }] as LeaseRun[], heading: false }));
  for (const paragraph of lines) {
    const text = paragraph.runs.map((r) => r.text).join("");
    if (!text.trim()) {
      y -= 10;
      if (y < 60) newPage();
      continue;
    }
    const heading =
        paragraph.heading ||
        /^(?:§|\d+\.\s.{1,90}$|TERMS$|TENANTS$|LANDLORD$|TEXAS RESIDENTIAL)/.test(
          text,
        ),
      size = heading ? 12 : 11;
    let x = 48;
    const lineBreak = () => {
      y -= 15;
      x = 48;
      if (y < 65) newPage();
    };
    if (y < 65) newPage();
    for (const run of paragraph.runs) {
      const isBold = heading || run.bold,
        font = isBold
          ? run.italic
            ? boldItalic
            : bold
          : run.italic
            ? italic
            : normal;
      const draw = (chunk: string) => {
        const width = font.widthOfTextAtSize(chunk, size);
        page.drawText(chunk, { x, y, size, font });
        if (run.underline)
          page.drawLine({
            start: { x, y: y - 1.5 },
            end: { x: x + width, y: y - 1.5 },
            thickness: 0.5,
          });
        x += width;
      };
      for (const token of run.text.split(/(\n|[^\S\n]+)/)) {
        if (!token) continue;
        if (token === "\n") {
          lineBreak();
          continue;
        }
        const chunk = sanitize(token),
          width = font.widthOfTextAtSize(chunk, size);
        if (x + width > 564 && x > 48) lineBreak();
        if (!chunk.trim() && x === 48) continue;
        if (width > 516) {
          for (const char of chunk) {
            if (x + font.widthOfTextAtSize(char, size) > 564) lineBreak();
            draw(char);
          }
        } else draw(chunk);
      }
    }
    y -= 15;
  }
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText("DRAFT - REVIEW BEFORE SIGNING", {
      x: 48,
      y: 760,
      size: 9,
      font: bold,
      color: rgb(0.3, 0.3, 0.3),
    });
    pages[i].drawText(
      `${reference.slice(0, 8)} | Page ${i + 1} of ${pages.length}`,
      { x: 48, y: 30, size: 9, font: normal, color: rgb(0.3, 0.3, 0.3) },
    );
  }
  return pdf.save();
}
