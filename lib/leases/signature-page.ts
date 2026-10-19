import { type PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

/** Marks a frozen lease PDF that already ends with blank signature pages. */
export const SIGNATURE_PAGE_KEYWORD = "back-acres-signature-page-v1";

const PER_PAGE = 4;
const BLOCK = 150;
const TOP = 660;
const LEFT = 48;
const LINE_END = 360;
const DATE_X = 392;
const DATE_END = 564;
const ink = rgb(0.12, 0.12, 0.12);
const muted = rgb(0.4, 0.4, 0.4);

interface SignerLike {
  email: string;
  name: string;
  role: string;
}

/** Tenants first, then the landlord, so every render places people the same. */
export function signatureOrder<T extends SignerLike>(signers: T[]) {
  const rank = (role: string) => (role === "tenant" ? 0 : 1);
  return [...signers].sort(
    (a, b) =>
      rank(a.role) - rank(b.role) ||
      a.email.toLowerCase().localeCompare(b.email.toLowerCase()) ||
      a.name.localeCompare(b.name)
  );
}

export const signaturePageCount = (count: number) =>
  Math.max(1, Math.ceil(count / PER_PAGE));

/** Where one signer's line sits: page offset and the y of the line. */
function slot(index: number) {
  return {
    page: Math.floor(index / PER_PAGE),
    y: TOP - (index % PER_PAGE) * BLOCK - 70,
  };
}

const roleLabels: Record<string, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
};
const roleLabel = (role: string) => roleLabels[role] ?? role;

/** Adds blank signature pages, one block per signer, at the end. */
export function drawSignaturePages(
  pdf: PDFDocument,
  signers: SignerLike[],
  fonts: { bold: PDFFont; label: PDFFont; labelBold: PDFFont }
) {
  const ordered = signatureOrder(signers);
  const pages: PDFPage[] = [];
  const count = signaturePageCount(ordered.length);
  for (let index = 0; index < count; index += 1) {
    const first = index === 0;
    const page = pdf.addPage([612, 792]);
    page.drawText(first ? "Signatures" : "Signatures (continued)", {
      color: ink,
      font: fonts.bold,
      size: 18,
      x: LEFT,
      y: 720,
    });
    if (first) {
      page.drawText(
        "Each person below signs this lease electronically. Signatures appear here once recorded.",
        { color: muted, font: fonts.label, size: 9, x: LEFT, y: 700 }
      );
    }
    pages.push(page);
  }
  ordered.forEach((signer, index) => {
    const { page, y } = slot(index);
    const target = pages[page];
    target.drawText(roleLabel(signer.role).toUpperCase(), {
      color: muted,
      font: fonts.labelBold,
      size: 8,
      x: LEFT,
      y: y + 62,
    });
    target.drawLine({
      color: ink,
      end: { x: LINE_END, y },
      start: { x: LEFT, y },
      thickness: 0.75,
    });
    target.drawLine({
      color: ink,
      end: { x: DATE_END, y },
      start: { x: DATE_X, y },
      thickness: 0.75,
    });
    target.drawText(signer.name, {
      color: ink,
      font: fonts.label,
      size: 10,
      x: LEFT,
      y: y - 14,
    });
    target.drawText("Signature", {
      color: muted,
      font: fonts.label,
      size: 8,
      x: LEFT,
      y: y - 26,
    });
    target.drawText("Date signed", {
      color: muted,
      font: fonts.label,
      size: 8,
      x: DATE_X,
      y: y - 14,
    });
  });
  return pages;
}

/** Draws each recorded signature and its date onto the signature pages. */
export async function fillSignaturePages(
  pdf: PDFDocument,
  firstPage: number,
  signers: (SignerLike & {
    signaturePng: string | null;
    signedAt: Date | null;
  })[],
  font: PDFFont
) {
  const ordered = signatureOrder(signers);
  for (const [index, signer] of ordered.entries()) {
    if (!(signer.signedAt && signer.signaturePng)) {
      continue;
    }
    const { page, y } = slot(index);
    const target = pdf.getPage(firstPage + page);
    const image =
      /* biome-ignore lint/performance/noAwaitInLoops: pdf-lib embeds into one document; order keeps object numbers stable. */ await pdf.embedPng(
        Buffer.from(signer.signaturePng, "base64")
      );
    const size = image.scaleToFit(LINE_END - LEFT - 8, 54);
    target.drawImage(image, {
      height: size.height,
      width: size.width,
      x: LEFT + 4,
      y: y + 3,
    });
    target.drawText(
      signer.signedAt.toLocaleDateString("en-US", {
        dateStyle: "long",
        timeZone: "America/Chicago",
      }),
      { color: ink, font, size: 11, x: DATE_X + 2, y: y + 5 }
    );
  }
}
