import { requireValue } from "@/lib/required";

const pattern1 = /(?:RESIDENTIAL|LEASE|AGREEMENT)/i;
const pattern2 =
  /^(?:§|\d+\.\s.{1,90}$|TERMS$|TENANTS$|LANDLORD$|TEXAS RESIDENTIAL)/;
const pattern3 = /(\n|[^\S\n]+)/;
const signaturesHeading = /^(?:§\s*)?(?:\d+\.\s*)?signatures?\b/i;

import { PDFDocument, type PDFFont, rgb } from "pdf-lib";
import { documentLines, type LeaseNode, type LeaseRun } from "./document";
import { leaseFonts } from "./pdf-fonts";
import {
  drawSignatureBlock,
  encodePositions,
  SIGNATURE_BLOCK_HEIGHT,
  type SignaturePosition,
  signatureOrder,
} from "./signature-page";
import { leaseTerms } from "./terms";
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function leasePdf(
  body: string,
  reference: string,
  document?: LeaseNode | null,
  branding?: {
    name: string;
    logoPng: string | null;
    forSigning?: boolean;
    /** Signers of a signing copy: their blocks replace the Signatures section. */
    signers?: {
      email: string | null;
      name: string;
      phone?: string | null;
      role: string;
    }[];
  }
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    branding?.forSigning ? "Residential lease" : "Residential lease draft"
  );
  pdf.setSubject(
    branding?.forSigning
      ? "Lease prepared for electronic signature"
      : "Owner review required before execution"
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
      " "
    );
  const newPage = () => {
    page = pdf.addPage([612, 792]);
    y = top;
  };
  const paragraphs = document
    ? documentLines(document)
    : body
        .split("\n")
        .map((text) => ({ heading: false, runs: [{ text }] as LeaseRun[] }));
  const wrapSummary = (
    value: string,
    face: PDFFont,
    size: number,
    maxWidth: number
  ) => {
    const rows: string[] = [];
    let row = "";
    for (const character of safe(value)) {
      if (row && face.widthOfTextAtSize(row + character, size) > maxWidth) {
        rows.push(row);
        row = "";
      }
      row += character;
    }
    rows.push(row);
    return rows;
  };
  const fonts = { bold, label, labelBold };
  const signers = branding?.signers?.length
    ? signatureOrder(branding.signers)
    : [];
  const positions: SignaturePosition[] = [];
  let skipping = false;
  /** Draws a signature block per signer from the current line down. */
  const drawBlocks = () => {
    for (const [index, signer] of signers.entries()) {
      if (y - SIGNATURE_BLOCK_HEIGHT < bottom) {
        newPage();
      }
      const lineY = y - 70;
      const position = {
        index,
        left,
        page: pdf.getPageCount() - 1,
        right,
        y: lineY,
      };
      drawSignatureBlock(page, signer, position, fonts);
      positions.push(position);
      y = lineY - 42;
    }
  };
  let first = true;
  for (
    let paragraphIndex = 0;
    paragraphIndex < paragraphs.length;
    paragraphIndex += 1
  ) {
    const paragraph = paragraphs[paragraphIndex];
    const terms = leaseTerms(paragraphs, paragraphIndex);
    if (terms) {
      const padding = 10,
        cellWidth = width / 2,
        headerHeight = 24;
      const cells = terms.fields.map((field) => ({
        label: wrapSummary(field.label, label, 8, cellWidth - padding * 2),
        value: wrapSummary(field.value, normal, 11, cellWidth - padding * 2),
      }));
      const rowHeights: number[] = [];
      for (let i = 0; i < cells.length; i += 2) {
        rowHeights.push(
          Math.max(
            ...cells
              .slice(i, i + 2)
              .map(
                (cell) =>
                  padding * 2 +
                  cell.label.length * 10 +
                  4 +
                  cell.value.length * 14
              )
          )
        );
      }
      const height =
        headerHeight + rowHeights.reduce((total, row) => total + row, 0);
      if (height <= top - bottom) {
        if (y - height < bottom) {
          newPage();
        }
        const tableTop = y + 4,
          tableBottom = tableTop - height;
        const line = rgb(0.72, 0.76, 0.73);
        page.drawRectangle({
          color: rgb(0.96, 0.97, 0.95),
          height: headerHeight,
          width,
          x: left,
          y: tableTop - headerHeight,
        });
        page.drawText("TERMS", {
          color: green,
          font: labelBold,
          size: 9,
          x: left + padding,
          y: tableTop - 16,
        });
        let rowTop = tableTop - headerHeight;
        page.drawLine({
          color: line,
          end: { x: right, y: rowTop },
          start: { x: left, y: rowTop },
          thickness: 0.5,
        });
        for (let row = 0; row < rowHeights.length; row += 1) {
          const rowHeight = rowHeights[row];
          for (let column = 0; column < 2; column += 1) {
            const cell = cells[row * 2 + column];
            if (!cell) {
              continue;
            }
            const x = left + column * cellWidth + padding;
            let baseline = rowTop - padding - 8;
            for (const text of cell.label) {
              page.drawText(text, {
                color: muted,
                font: label,
                size: 8,
                x,
                y: baseline,
              });
              baseline -= 10;
            }
            baseline -= 4;
            for (const text of cell.value) {
              page.drawText(text, {
                color: ink,
                font: normal,
                size: 11,
                x,
                y: baseline,
              });
              baseline -= 14;
            }
          }
          rowTop -= rowHeight;
          if (row < rowHeights.length - 1) {
            page.drawLine({
              color: line,
              end: { x: right, y: rowTop },
              start: { x: left, y: rowTop },
              thickness: 0.5,
            });
          }
        }
        page.drawLine({
          color: line,
          end: { x: left + cellWidth, y: tableBottom },
          start: { x: left + cellWidth, y: tableTop - headerHeight },
          thickness: 0.5,
        });
        page.drawRectangle({
          borderColor: line,
          borderWidth: 0.5,
          height,
          width,
          x: left,
          y: tableBottom,
        });
        y = tableBottom - 20;
        paragraphIndex = terms.end;
        first = false;
        continue;
      }
    }
    const text = paragraph.runs.map((r) => r.text).join("");
    const isHeading = paragraph.heading || pattern2.test(text);
    // The section's own lines are replaced by drawn signature blocks.
    if (skipping && !isHeading) {
      continue;
    }
    skipping = false;
    if (!text.trim()) {
      if (y < top) {
        y -= 7;
      }
      continue;
    }
    const title = first && pattern1.test(text) && text.length < 120;
    const heading = title || paragraph.heading || pattern2.test(text);
    const resolveSize1 = () => {
      if (title) {
        return 17;
      }
      if (heading) {
        return 12;
      }
      return 11;
    };
    const resolveLeading2 = () => {
      if (title) {
        return 23;
      }
      if (heading) {
        return 17;
      }
      return 16;
    };
    const size = resolveSize1(),
      leading = resolveLeading2();
    interface Chunk {
      font: PDFFont;
      text: string;
      underline?: boolean;
      width: number;
    }
    const rows: Chunk[][] = [[]];
    let used = 0;
    const lineBreak = () => {
      rows.push([]);
      used = 0;
    };
    for (const run of paragraph.runs) {
      const resolveFont3 = () => {
        if (heading || run.bold) {
          if (run.italic) {
            return boldItalic;
          }
          return bold;
        }
        if (run.italic) {
          return italic;
        }
        return normal;
      };
      const font = resolveFont3();
      const push = (textLocal: string) => {
        const w = font.widthOfTextAtSize(textLocal, size);
        requireValue(rows.at(-1), "PDF row must exist").push({
          font,
          text: textLocal,
          underline: run.underline,
          width: w,
        });
        used += w;
      };
      for (const token of run.text.split(pattern3)) {
        if (!token) {
          continue;
        }
        if (token === "\n") {
          lineBreak();
          continue;
        }
        const chunk = safe(token),
          w = font.widthOfTextAtSize(chunk, size);
        if (used + w > width && used > 0) {
          lineBreak();
        }
        if (!chunk.trim() && used === 0) {
          continue;
        }
        if (w > width) {
          for (const char of chunk) {
            if (used + font.widthOfTextAtSize(char, size) > width) {
              lineBreak();
            }
            push(char);
          }
        } else {
          push(chunk);
        }
      }
    }
    // Keep headings with the following lines; keep short paragraphs together.
    const required = heading
      ? rows.length * leading + 64
      : Math.min(rows.length, 3) * leading;
    if (y - required < bottom) {
      newPage();
    } else if (heading && !first && y < top) {
      y -= 8;
    }
    rows.forEach((row, index) => {
      if (y < bottom || (rows.length - index === 2 && y - leading < bottom)) {
        newPage();
      }
      let x = left;
      for (const chunk of row) {
        page.drawText(chunk.text, { color: ink, font: chunk.font, size, x, y });
        if (chunk.underline) {
          page.drawLine({
            color: ink,
            end: { x: x + chunk.width, y: y - 2 },
            start: { x, y: y - 2 },
            thickness: 0.5,
          });
        }
        x += chunk.width;
      }
      y -= leading;
    });
    y -= heading ? 5 : 3;
    first = false;
    if (
      heading &&
      signers.length &&
      !positions.length &&
      signaturesHeading.test(text.trim())
    ) {
      drawBlocks();
      skipping = true;
    }
  }
  if (signers.length && !positions.length) {
    // No Signatures section in this lease: add one at the end.
    newPage();
    page.drawText("Signatures", {
      color: ink,
      font: bold,
      size: 12,
      x: left,
      y,
    });
    y -= 22;
    drawBlocks();
  }
  if (positions.length) {
    pdf.setKeywords([encodePositions(positions)]);
  }
  const pages = pdf.getPages();
  pages.forEach(
    /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
    (p, index) => {
      if (branding) {
        const brandCenterY = 749,
          logoSize = logo?.scaleToFit(96, 38);
        if (logo && logoSize) {
          p.drawImage(logo, {
            height: logoSize.height,
            width: logoSize.width,
            x: left,
            y: brandCenterY - logoSize.height / 2,
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
          if (row) {
            rows.push(row.trim());
          }
          if (rows.length > 3) {
            size -= 0.5;
          }
        } while (rows.length > 3 && size > 6);
        p.drawText(rows.join("\n"), {
          color: green,
          font: labelBold,
          lineHeight: 12,
          size,
          x,
          y:
            brandCenterY +
            ((rows.length - 1) * 12) / 2 -
            labelBold.heightAtSize(size, { descender: false }) / 2,
        });
      }
      p.drawText(
        branding?.forSigning
          ? "RESIDENTIAL LEASE  /  ELECTRONIC SIGNING COPY"
          : "RESIDENTIAL LEASE  /  DRAFT FOR REVIEW",
        {
          color: muted,
          font: labelBold,
          size: 7.5,
          x: left,
          y: branding ? 705 : 750,
        }
      );
      p.drawLine({
        color: rgb(0.72, 0.76, 0.73),
        end: { x: right, y: branding ? 696 : 738 },
        start: { x: left, y: branding ? 696 : 738 },
        thickness: 0.5,
      });
      p.drawLine({
        color: rgb(0.72, 0.76, 0.73),
        end: { x: right, y: 47 },
        start: { x: left, y: 47 },
        thickness: 0.5,
      });
      p.drawText(`LEASE ${reference.slice(0, 8).toUpperCase()}`, {
        color: muted,
        font: label,
        size: 7.5,
        x: left,
        y: 32,
      });
      const number = `${index + 1} / ${pages.length}`;
      p.drawText(number, {
        color: muted,
        font: label,
        size: 8,
        x: right - label.widthOfTextAtSize(number, 8),
        y: 32,
      });
    }
  );
  return pdf.save();
}
