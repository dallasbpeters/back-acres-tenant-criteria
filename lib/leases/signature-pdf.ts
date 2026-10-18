import { leaseFonts } from "./pdf-fonts";
import { PDFDocument, type PDFFont } from "pdf-lib";
import type { leasePackets, leaseSigners } from "@/lib/db/signing";
/** Append recorded signatures without changing any page of the frozen lease. */
export async function signaturePdf(
  packet: typeof leasePackets.$inferSelect,
  signers: (typeof leaseSigners.$inferSelect)[],
  completed: boolean,
) {
  const pdf = await PDFDocument.load(Buffer.from(packet.basePdf, "base64"));
  pdf.setTitle(
    `${packet.brandName} - ${completed ? "Signed residential lease" : "Lease awaiting signatures"}`,
  );
  pdf.setSubject(`Frozen lease SHA-256 ${packet.documentHash}`);
  pdf.setModificationDate(
    new Date(
      Math.max(
        ...signers.filter((s) => s.signedAt).map((s) => s.signedAt!.getTime()),
      ),
    ),
  );
  const fonts = await leaseFonts(pdf),
    font = fonts.label,
    bold = fonts.labelBold;
  let page = pdf.addPage([612, 792]),
    y = 740;
  const safe = (s: string) =>
    s.replace(
      /[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g,
      " ",
    );
  const line = (text: string, size = 9, face: PDFFont = font) => {
    const lines: string[] = [];
    let current = "";
    for (const word of safe(text).split(/\s+/)) {
      if (
        face.widthOfTextAtSize(`${current} ${word}`.trim(), size) > 516 &&
        current
      ) {
        lines.push(current);
        current = "";
      }
      if (face.widthOfTextAtSize(word, size) > 516) {
        for (const character of word) {
          if (face.widthOfTextAtSize(current + character, size) > 516) {
            lines.push(current);
            current = "";
          }
          current += character;
        }
      } else current = `${current} ${word}`.trim();
    }
    if (current) lines.push(current);
    for (const textLine of lines) {
      if (y < 55) {
        page = pdf.addPage([612, 792]);
        y = 740;
      }
      page.drawText(textLine, { x: 48, y, size, font: face });
      y -= 14;
    }
  };
  page.drawText("Electronic signatures & audit record", {
    x: 48,
    y,
    size: 18,
    font: fonts.bold,
  });
  y -= 30;
  if (!completed) {
    line(
      `IN PROGRESS - ${signers.filter((s) => !s.signedAt).length} signature(s) still required.`,
      11,
    );
    y -= 8;
  }
  line(`Signing packet: ${packet.id}`);
  line(`Lease version: ${packet.draftId}`);
  line(`Original PDF SHA-256: ${packet.documentHash}`);
  line("Each signature is attached to this exact PDF. All times are UTC.");
  line(
    "Email-code verification confirms mailbox access; it is not government ID verification.",
  );
  for (const signer of signers) {
    if (y < 220) {
      page = pdf.addPage([612, 792]);
      y = 740;
    }
    y -= 15;
    line(`${signer.role.toUpperCase()}: ${signer.name}`, 10, bold);
    line(signer.email);
    if (!signer.signedAt) {
      line(
        signer.declinedAt
          ? "Declined electronic signing"
          : "Awaiting signature",
      );
      continue;
    }
    const image = await pdf.embedPng(
        Buffer.from(signer.signaturePng!, "base64"),
      ),
      dimensions = image.scaleToFit(240, 75);
    page.drawImage(image, {
      x: 48,
      y: y - 80,
      width: dimensions.width,
      height: dimensions.height,
    });
    y -= 90;
    line(`Signed: ${signer.signedAt!.toISOString()}`);
    line(`Email verified: ${signer.verifiedAt!.toISOString()}`);
    line(`Evidence SHA-256: ${signer.evidenceHash}`);
    line(`Consent version: ${signer.consentVersion}`);
    line(signer.consent!);
  }
  await pdf.attach(
    Buffer.from(packet.basePdf, "base64"),
    "original-lease.pdf",
    {
      mimeType: "application/pdf",
      description: "Exact original document reviewed and signed",
    },
  );
  await pdf.attach(
    Buffer.from(
      JSON.stringify(
        {
          packetId: packet.id,
          status: completed ? "completed" : "awaiting",
          documentHash: packet.documentHash,
          signers: signers.map((s) => ({
            evidence: s.evidence ? JSON.parse(s.evidence) : null,
            evidenceHash: s.evidenceHash,
          })),
        },
        null,
        2,
      ),
    ),
    "signature-audit.json",
    {
      mimeType: "application/json",
      description: "Signature evidence and document fingerprints",
    },
  );
  return pdf.save();
}
