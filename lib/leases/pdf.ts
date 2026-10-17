import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
export async function leasePdf(body: string, reference: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Residential lease draft");
  pdf.setSubject("Owner review required before execution");
  const normal = await pdf.embedFont(StandardFonts.TimesRoman),
    bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
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
  for (const paragraph of body.split(/\n/)) {
    const text = sanitize(paragraph);
    if (!text.trim()) {
      y -= 10;
      if (y < 60) newPage();
      continue;
    }
    const heading =
      /^(?:§|\d+\.\s.{1,90}$|TERMS$|TENANTS$|LANDLORD$|TEXAS RESIDENTIAL)/.test(
        text,
      );
    const font = heading ? bold : normal,
      size = heading ? 12 : 11;
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > 516) {
        if (line) {
          if (y < 65) newPage();
          page.drawText(line, { x: 48, y, size, font });
          y -= 15;
          line = "";
        }
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > 516) {
            if (y < 65) newPage();
            page.drawText(chunk, { x: 48, y, size, font });
            y -= 15;
            chunk = "";
          }
          chunk += char;
        }
        line = chunk;
        continue;
      }
      if (font.widthOfTextAtSize(line ? line + " " + word : word, size) > 516) {
        if (y < 65) newPage();
        page.drawText(line, { x: 48, y, size, font });
        y -= 15;
        line = word;
      } else line = line ? line + " " + word : word;
    }
    if (line) {
      if (y < 65) newPage();
      page.drawText(line, { x: 48, y, size, font });
      y -= 15;
    }
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
