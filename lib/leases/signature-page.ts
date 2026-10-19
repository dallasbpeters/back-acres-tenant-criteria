import { type PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

/** Older frozen leases: blank signature pages at the very end. */
export const SIGNATURE_PAGE_KEYWORD = "back-acres-signature-page-v1";
/** Newer frozen leases list each signature block's spot in the keywords. */
const POSITIONS_PREFIX = "sigpos:";

const PER_PAGE = 4;
const BLOCK = 150;
const TOP = 660;
const PAGE_LEFT = 48;
const PAGE_RIGHT = 564;
/** Height one inline signature block needs, from label to caption. */
export const SIGNATURE_BLOCK_HEIGHT = 104;
const ink = rgb(0.12, 0.12, 0.12);
const muted = rgb(0.4, 0.4, 0.4);

interface SignerLike {
  email: string | null;
  name: string;
  phone?: string | null;
  role: string;
}
interface Fonts {
  bold: PDFFont;
  label: PDFFont;
  labelBold: PDFFont;
}
/** Where one signer's signature line sits on the frozen PDF. */
export interface SignaturePosition {
  index: number;
  left: number;
  page: number;
  right: number;
  y: number;
}
const contact = (s: SignerLike) => (s.email ?? s.phone ?? "").toLowerCase();

/** Tenants first, then the landlord, so every render places people the same. */
export function signatureOrder<T extends SignerLike>(signers: T[]) {
  const rank = (role: string) => (role === "tenant" ? 0 : 1);
  return [...signers].sort(
    (a, b) =>
      rank(a.role) - rank(b.role) ||
      contact(a).localeCompare(contact(b)) ||
      a.name.localeCompare(b.name)
  );
}

export const signaturePageCount = (count: number) =>
  Math.max(1, Math.ceil(count / PER_PAGE));

const roleLabels: Record<string, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
};
const roleLabel = (role: string) => roleLabels[role] ?? role;
const geometry = (left: number, right: number) => {
  const lineEnd = left + (right - left) * 0.6;
  return { dateEnd: right, dateX: lineEnd + 32, lineEnd };
};

/**
 * Draws one blank signature block whose signature line sits at `y`: role,
 * signature line, printed name, and a date line.
 */
export function drawSignatureBlock(
  page: PDFPage,
  signer: SignerLike,
  { left, right, y }: { left: number; right: number; y: number },
  fonts: Fonts
) {
  const { dateEnd, dateX, lineEnd } = geometry(left, right);
  page.drawText(roleLabel(signer.role).toUpperCase(), {
    color: muted,
    font: fonts.labelBold,
    size: 8,
    x: left,
    y: y + 62,
  });
  for (const [start, end] of [
    [left, lineEnd],
    [dateX, dateEnd],
  ]) {
    page.drawLine({
      color: ink,
      end: { x: end, y },
      start: { x: start, y },
      thickness: 0.75,
    });
  }
  page.drawText(signer.name, {
    color: ink,
    font: fonts.label,
    size: 10,
    x: left,
    y: y - 14,
  });
  page.drawText("Signature", {
    color: muted,
    font: fonts.label,
    size: 8,
    x: left,
    y: y - 26,
  });
  page.drawText("Date signed", {
    color: muted,
    font: fonts.label,
    size: 8,
    x: dateX,
    y: y - 14,
  });
}

/** Stores signature spots in the PDF keywords, without spaces. */
export function encodePositions(positions: SignaturePosition[]) {
  return `${POSITIONS_PREFIX}${positions
    .map((p) =>
      [p.index, p.page, p.y, p.left, p.right]
        .map((n) => Math.round(n * 10) / 10)
        .join(",")
    )
    .join(";")}`;
}
function decodePositions(keywords: string): SignaturePosition[] | null {
  const entry = keywords
    .split(" ")
    .find((word) => word.startsWith(POSITIONS_PREFIX));
  if (!entry) {
    return null;
  }
  return entry
    .slice(POSITIONS_PREFIX.length)
    .split(";")
    .map((part) => {
      const [index, page, y, left, right] = part.split(",").map(Number);
      return { index, left, page, right, y };
    });
}

/** Adds blank signature pages at the end and returns each block's spot. */
export function drawSignaturePages(
  pdf: PDFDocument,
  signers: SignerLike[],
  fonts: Fonts
): SignaturePosition[] {
  const ordered = signatureOrder(signers);
  const firstPage = pdf.getPageCount();
  const count = signaturePageCount(ordered.length);
  for (let index = 0; index < count; index += 1) {
    const first = index === 0;
    const page = pdf.addPage([612, 792]);
    page.drawText(first ? "Signatures" : "Signatures (continued)", {
      color: ink,
      font: fonts.bold,
      size: 18,
      x: PAGE_LEFT,
      y: 720,
    });
    if (first) {
      page.drawText(
        "Each person below signs this lease electronically. Signatures appear here once recorded.",
        { color: muted, font: fonts.label, size: 9, x: PAGE_LEFT, y: 700 }
      );
    }
  }
  return ordered.map((signer, index) => {
    const position = {
      index,
      left: PAGE_LEFT,
      page: firstPage + Math.floor(index / PER_PAGE),
      right: PAGE_RIGHT,
      y: TOP - (index % PER_PAGE) * BLOCK - 70,
    };
    drawSignatureBlock(pdf.getPage(position.page), signer, position, fonts);
    return position;
  });
}

/** Signature spots in a frozen lease, adding end pages to very old ones. */
function signaturePositions(
  pdf: PDFDocument,
  signers: SignerLike[],
  fonts: Fonts
) {
  const keywords = pdf.getKeywords() ?? "";
  const stored = decodePositions(keywords);
  if (stored) {
    return stored;
  }
  if (!keywords.includes(SIGNATURE_PAGE_KEYWORD)) {
    return drawSignaturePages(pdf, signers, fonts);
  }
  const firstPage = pdf.getPageCount() - signaturePageCount(signers.length);
  return signers.map((_, index) => ({
    index,
    left: PAGE_LEFT,
    page: firstPage + Math.floor(index / PER_PAGE),
    right: PAGE_RIGHT,
    y: TOP - (index % PER_PAGE) * BLOCK - 70,
  }));
}

/** Draws each recorded signature and its date on that signer's line. */
export async function fillSignatures(
  pdf: PDFDocument,
  signers: (SignerLike & {
    signaturePng: string | null;
    signedAt: Date | null;
  })[],
  fonts: Fonts
) {
  const ordered = signatureOrder(signers);
  for (const position of signaturePositions(pdf, signers, fonts)) {
    const signer = ordered[position.index];
    if (!(signer?.signedAt && signer.signaturePng)) {
      continue;
    }
    const { dateX, lineEnd } = geometry(position.left, position.right);
    const page = pdf.getPage(position.page);
    const image =
      /* biome-ignore lint/performance/noAwaitInLoops: pdf-lib embeds into one document; order keeps object numbers stable. */ await pdf.embedPng(
        Buffer.from(signer.signaturePng, "base64")
      );
    const size = image.scaleToFit(lineEnd - position.left - 8, 54);
    page.drawImage(image, {
      height: size.height,
      width: size.width,
      x: position.left + 4,
      y: position.y + 3,
    });
    page.drawText(
      signer.signedAt.toLocaleDateString("en-US", {
        dateStyle: "long",
        timeZone: "America/Chicago",
      }),
      {
        color: ink,
        font: fonts.label,
        size: 11,
        x: dateX + 2,
        y: position.y + 5,
      }
    );
  }
}
