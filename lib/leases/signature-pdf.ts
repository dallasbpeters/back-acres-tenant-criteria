import { requireValue } from "@/lib/required";

const pattern1 = /\s+/;

import { PDFDocument, type PDFFont } from "pdf-lib";
import type { leasePackets, leaseSigners } from "@/lib/db/signing";
import { findInitialBlanks } from "./find-initials";
import { leaseFonts } from "./pdf-fonts";
import {
  decodeInitialPositions,
  fillSignatures,
  signerInitials,
} from "./signature-page";

/**
 * Draws recorded signatures on each signer's line in the lease, then adds
 * the audit record. Older leases without signature lines get a page added.
 */
export async function signaturePdf(
  packet: typeof leasePackets.$inferSelect,
  signers: (typeof leaseSigners.$inferSelect)[],
  completed: boolean
) {
  const pdf = await PDFDocument.load(Buffer.from(packet.basePdf, "base64"));
  pdf.setTitle(
    `${packet.brandName} - ${completed ? "Signed residential lease" : "Lease awaiting signatures"}`
  );
  pdf.setSubject(`Frozen lease SHA-256 ${packet.documentHash}`);
  pdf.setModificationDate(
    new Date(
      Math.max(
        ...signers
          .filter((s) => s.signedAt)
          .map((s) => requireValue(s.signedAt, "Expected s.signedAt").getTime())
      )
    )
  );
  const fonts = await leaseFonts(pdf),
    font = fonts.label,
    bold = fonts.labelBold;
  // Leases frozen before blank positions were recorded: find the blanks in
  // the PDF itself, but only when someone actually initialed.
  const recorded = decodeInitialPositions(pdf.getKeywords() ?? "");
  const blanks =
    recorded ??
    (signers.some((s) => signerInitials(s.evidence))
      ? await findInitialBlanks(Buffer.from(packet.basePdf, "base64")).catch(
          () => []
        )
      : []);
  await fillSignatures(pdf, signers, fonts, blanks);
  let page = pdf.addPage([612, 792]),
    y = 740;
  const safe = (s: string) =>
    s.replace(
      /[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g,
      " "
    );
  const line =
    /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
    (text: string, size = 9, face: PDFFont = font) => {
      const lines: string[] = [];
      let current = "";
      for (const word of safe(text).split(pattern1)) {
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
        } else {
          current = `${current} ${word}`.trim();
        }
      }
      if (current) {
        lines.push(current);
      }
      for (const textLine of lines) {
        if (y < 55) {
          page = pdf.addPage([612, 792]);
          y = 740;
        }
        page.drawText(textLine, { font: face, size, x: 48, y });
        y -= 14;
      }
    };
  page.drawText("Electronic signatures & audit record", {
    font: fonts.bold,
    size: 18,
    x: 48,
    y,
  });
  y -= 30;
  if (!completed) {
    line(
      `IN PROGRESS - ${signers.filter((s) => !s.signedAt).length} signature(s) still required.`,
      11
    );
    y -= 8;
  }
  line(`Signing packet: ${packet.id}`);
  line(`Lease version: ${packet.draftId}`);
  line(`Original PDF SHA-256: ${packet.documentHash}`);
  line("Each signature is attached to this exact PDF. All times are UTC.");
  line(
    "Opening the private emailed link, or the signer's verified portal account, confirms mailbox access; it is not government ID verification."
  );
  for (const signer of signers) {
    if (y < 220) {
      page = pdf.addPage([612, 792]);
      y = 740;
    }
    y -= 15;
    line(`${signer.role.toUpperCase()}: ${signer.name}`, 10, bold);
    line(signer.email ?? signer.phone ?? "");
    if (!signer.signedAt) {
      line(
        signer.declinedAt ? "Declined electronic signing" : "Awaiting signature"
      );
      continue;
    }
    const image =
        /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await pdf.embedPng(
          Buffer.from(
            requireValue(signer.signaturePng, "Expected signer.signaturePng"),
            "base64"
          )
        ),
      dimensions = image.scaleToFit(240, 75);
    page.drawImage(image, {
      height: dimensions.height,
      width: dimensions.width,
      x: 48,
      y: y - 80,
    });
    y -= 90;
    line(
      `Signed: ${requireValue(signer.signedAt, "Expected signer.signedAt").toISOString()}`
    );
    line(
      `Email verified: ${requireValue(signer.verifiedAt, "Expected signer.verifiedAt").toISOString()}`
    );
    line(`Evidence SHA-256: ${signer.evidenceHash}`);
    line(`Consent version: ${signer.consentVersion}`);
    line(requireValue(signer.consent, "Expected signer.consent"));
  }
  await pdf.attach(
    Buffer.from(packet.basePdf, "base64"),
    "original-lease.pdf",
    {
      description: "Exact original document reviewed and signed",
      mimeType: "application/pdf",
    }
  );
  await pdf.attach(
    Buffer.from(
      JSON.stringify(
        {
          documentHash: packet.documentHash,
          packetId: packet.id,
          signers: signers.map((s) => ({
            evidence: s.evidence ? JSON.parse(s.evidence) : null,
            evidenceHash: s.evidenceHash,
          })),
          status: completed ? "completed" : "awaiting",
        },
        null,
        2
      )
    ),
    "signature-audit.json",
    {
      description: "Signature evidence and document fingerprints",
      mimeType: "application/json",
    }
  );
  return pdf.save();
}
