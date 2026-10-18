import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { documentLines, type LeaseNode, type LeaseRun } from "./document";
import { leaseFonts } from "./pdf-fonts";

export async function leasePdf(
  body: string,
  reference: string,
  document?: LeaseNode | null,
  branding?: { name: string; logoPng: string | null; forSigning?: boolean },
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    branding?.forSigning ? "Residential lease" : "Residential lease draft",
  );
  pdf.setSubject(
    branding?.forSigning
      ? "Lease prepared for electronic signature"
      : "Owner review required before execution",
  );
  const { normal, bold, italic, boldItalic, label, labelBold } =
    await leaseFonts(pdf);
  const logo = branding?.logoPng
    ? await pdf.embedPng(Buffer.from(branding.logoPng, "base64"))
    : null;
  const ink = rgb(0.13, 0.17, 0.14),
    muted = rgb(0.35, 0.39, 0.36),
    green = rgb(0.16, 0.3, 0.22);
  const left = 54,
    right = 558,
    width = right - left,
    top = branding ? 676 : 716,
    bottom = 64;
  let page = pdf.addPage([612, 792]),
    y = top;
  const safe = (text: string) =>
    text.replace(
      /[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g,
      " ",
    );
  const newPage = () => {
    page = pdf.addPage([612, 792]);
    y = top;
  };
  const paragraphs = document
    ? documentLines(document)
    : body
        .split("\n")
        .map((text) => ({ runs: [{ text }] as LeaseRun[], heading: false }));
  let first = true;
  for (const paragraph of paragraphs) {
    const text = paragraph.runs.map((r) => r.text).join("");
    if (!text.trim()) {
      if (y < top) y -= 7;
      continue;
    }
    const title =
      first &&
      /(?:RESIDENTIAL|LEASE|AGREEMENT)/i.test(text) &&
      text.length < 120;
    const heading =
      title ||
      paragraph.heading ||
      /^(?:§|\d+\.\s.{1,90}$|TERMS$|TENANTS$|LANDLORD$|TEXAS RESIDENTIAL)/.test(
        text,
      );
    const size = title ? 17 : heading ? 12 : 11,
      leading = title ? 23 : heading ? 17 : 16;
    type Chunk = {
      text: string;
      font: PDFFont;
      underline?: boolean;
      width: number;
    };
    const rows: Chunk[][] = [[]];
    let used = 0;
    const lineBreak = () => {
      rows.push([]);
      used = 0;
    };
    for (const run of paragraph.runs) {
      const font =
        heading || run.bold
          ? run.italic
            ? boldItalic
            : bold
          : run.italic
            ? italic
            : normal;
      const push = (text: string) => {
        const w = font.widthOfTextAtSize(text, size);
        rows[rows.length - 1].push({
          text,
          font,
          underline: run.underline,
          width: w,
        });
        used += w;
      };
      for (const token of run.text.split(/(\n|[^\S\n]+)/)) {
        if (!token) continue;
        if (token === "\n") {
          lineBreak();
          continue;
        }
        const chunk = safe(token),
          w = font.widthOfTextAtSize(chunk, size);
        if (used + w > width && used > 0) lineBreak();
        if (!chunk.trim() && used === 0) continue;
        if (w > width) {
          for (const char of chunk) {
            if (used + font.widthOfTextAtSize(char, size) > width) lineBreak();
            push(char);
          }
        } else push(chunk);
      }
    }
    // Keep headings with the following lines; keep short paragraphs together.
    const required = heading
      ? rows.length * leading + 32
      : Math.min(rows.length, 3) * leading;
    if (y - required < bottom) newPage();
    else if (heading && !first && y < top) y -= 8;
    rows.forEach((row, index) => {
      if (y < bottom || (rows.length - index === 2 && y - leading < bottom))
        newPage();
      let x = left;
      for (const chunk of row) {
        page.drawText(chunk.text, { x, y, size, font: chunk.font, color: ink });
        if (chunk.underline)
          page.drawLine({
            start: { x, y: y - 2 },
            end: { x: x + chunk.width, y: y - 2 },
            thickness: 0.5,
            color: ink,
          });
        x += chunk.width;
      }
      y -= leading;
    });
    y -= heading ? 5 : 3;
    first = false;
  }
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    if (branding) {
      const brandCenterY = 749,
        logoSize = logo?.scaleToFit(96, 38);
      if (logo && logoSize) {
        p.drawImage(logo, {
          x: left,
          y: brandCenterY - logoSize.height / 2,
          width: logoSize.width,
          height: logoSize.height,
        });
      }
      const x = logoSize ? left + logoSize.width + 12 : left,
        available = right - x,
        name = safe(branding.name);
      let size = 11,
        rows: string[] = [];
      do {
        rows = [];
        let row = "";
        for (const char of name) {
          if (labelBold.widthOfTextAtSize(row + char, size) > available) {
            rows.push(row.trimEnd());
            row = "";
          }
          row += char;
        }
        if (row) rows.push(row.trim());
        if (rows.length > 3) size -= 0.5;
      } while (rows.length > 3 && size > 6);
      p.drawText(rows.join("\n"), {
        x,
        y:
          brandCenterY +
          ((rows.length - 1) * 12) / 2 -
          labelBold.heightAtSize(size, { descender: false }) / 2,
        size,
        lineHeight: 12,
        font: labelBold,
        color: green,
      });
    }
    p.drawText(
      branding?.forSigning
        ? "RESIDENTIAL LEASE  /  ELECTRONIC SIGNING COPY"
        : "RESIDENTIAL LEASE  /  DRAFT FOR REVIEW",
      {
        x: left,
        y: branding ? 705 : 750,
        size: 7.5,
        font: labelBold,
        color: muted,
      },
    );
    p.drawLine({
      start: { x: left, y: branding ? 696 : 738 },
      end: { x: right, y: branding ? 696 : 738 },
      thickness: 0.5,
      color: rgb(0.72, 0.76, 0.73),
    });
    p.drawLine({
      start: { x: left, y: 47 },
      end: { x: right, y: 47 },
      thickness: 0.5,
      color: rgb(0.72, 0.76, 0.73),
    });
    p.drawText(`LEASE ${reference.slice(0, 8).toUpperCase()}`, {
      x: left,
      y: 32,
      size: 7.5,
      font: label,
      color: muted,
    });
    const number = `${index + 1} / ${pages.length}`;
    p.drawText(number, {
      x: right - label.widthOfTextAtSize(number, 8),
      y: 32,
      size: 8,
      font: label,
      color: muted,
    });
  });
  return pdf.save();
}
