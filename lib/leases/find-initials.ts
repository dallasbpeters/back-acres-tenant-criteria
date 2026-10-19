import "server-only";
import { PDFDocument, type PDFFont } from "pdf-lib";
import { initialRoleOf } from "./initials";
import { leaseFonts } from "./pdf-fonts";
import type { InitialPosition } from "./signature-page";

const blankAfterLabel =
  /\b(tenant|landlord|resident|owner)?(?:['’]s)?\s*initials?\s*:?\s*(_{3,})/gi;

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

/**
 * Finds the initials blanks in a lease PDF frozen before blank positions
 * were recorded. pdfjs reads each line as one piece of text, so the blank's
 * start is measured with the lease's own fonts.
 */
export async function findInitialBlanks(
  bytes: Uint8Array
): Promise<InitialPosition[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
  }).promise;
  const scratch = await PDFDocument.create();
  const fonts = await leaseFonts(scratch);
  const candidates = [fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic];
  const blanks: InitialPosition[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Pages are read in order so blanks stay in reading order.
    const page = await document.getPage(number);
    const { items } = await page.getTextContent();
    for (const item of items as TextItem[]) {
      if (!item.str.includes("_")) {
        continue;
      }
      const size = Math.hypot(item.transform[0], item.transform[1]);
      const font = closestFont(candidates, item, size);
      for (const match of item.str.matchAll(blankAfterLabel)) {
        const blankAt = (match.index ?? 0) + match[0].lastIndexOf(match[2]);
        blanks.push({
          page: number - 1,
          role: initialRoleOf(match[1]),
          width: font.widthOfTextAtSize(match[2], size),
          x:
            item.transform[4] +
            font.widthOfTextAtSize(item.str.slice(0, blankAt), size),
          y: item.transform[5],
        });
      }
    }
  }
  await document.cleanup();
  return blanks;
}

/** The lease font whose width for this text best matches what pdfjs read. */
function closestFont(fonts: PDFFont[], item: TextItem, size: number) {
  let [best] = fonts;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const font of fonts) {
    const gap = Math.abs(font.widthOfTextAtSize(item.str, size) - item.width);
    if (gap < bestGap) {
      best = font;
      bestGap = gap;
    }
  }
  return best;
}
