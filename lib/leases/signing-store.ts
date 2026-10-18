import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { leasePackets, leaseSigners, leaseDrafts } from "@/lib/db/schema";
import { notRemoved } from "@/lib/management/not-removed";
import { digest } from "./signing-model";
export async function activePacket(id: string) {
  const [packet] = await db()
    .select({ packet: leasePackets })
    .from(leasePackets)
    .innerJoin(leaseDrafts, eq(leasePackets.draftId, leaseDrafts.id))
    .where(
      and(
        eq(leasePackets.id, id),
        notRemoved(leaseDrafts.id),
        notRemoved(leaseDrafts.propertyId),
      ),
    );
  return packet?.packet ?? null;
}
export async function tokenSigner(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [signer] = await db()
    .select()
    .from(leaseSigners)
    .where(eq(leaseSigners.tokenHash, digest(token)));
  if (!signer) return null;
  const packet = await activePacket(signer.packetId);
  if (
    !packet ||
    packet.status === "voided" ||
    (packet.expiresAt < new Date() && packet.status !== "completed")
  )
    return null;
  return { signer, packet };
}
export async function completePacket(id: string) {
  const packet = await activePacket(id);
  if (!packet) return null;
  if (packet.finalPdf || packet.status === "voided") return packet;
  const signers = await db()
    .select()
    .from(leaseSigners)
    .where(eq(leaseSigners.packetId, id))
    .orderBy(leaseSigners.id);
  if (!signers.length || signers.some((s) => !s.signedAt)) return packet;
  const pdf = await PDFDocument.load(Buffer.from(packet.basePdf, "base64"));
  pdf.setTitle(`${packet.brandName} - Signed residential lease`);
  pdf.setSubject(`Signed document SHA-256 ${packet.documentHash}`);
  pdf.setModificationDate(
    new Date(Math.max(...signers.map((s) => s.signedAt!.getTime()))),
  );
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]),
    y = 740;
  const safe = (s: string) =>
    s.replace(
      /[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g,
      " ",
    );
  const line = (text: string, size = 9) => {
    const lines: string[] = [];
    let current = "";
    for (const word of safe(text).split(/\s+/)) {
      if (
        font.widthOfTextAtSize(`${current} ${word}`.trim(), size) > 516 &&
        current
      ) {
        lines.push(current);
        current = "";
      }
      if (font.widthOfTextAtSize(word, size) > 516) {
        for (const character of word) {
          if (font.widthOfTextAtSize(current + character, size) > 516) {
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
      page.drawText(textLine, { x: 48, y, size, font });
      y -= 14;
    }
  };
  page.drawText("Electronic signatures & audit record", {
    x: 48,
    y,
    size: 16,
    font: bold,
  });
  y -= 30;
  line(`Signing packet: ${id}`);
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
    line(`${signer.role.toUpperCase()}: ${signer.name}`, 11);
    line(signer.email);
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
          packetId: id,
          documentHash: packet.documentHash,
          signers: signers.map((s) => ({
            evidence: JSON.parse(s.evidence!),
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
  const bytes = await pdf.save(),
    hash = digest(bytes);
  await db()
    .update(leasePackets)
    .set({
      status: "completed",
      finalPdf: Buffer.from(bytes).toString("base64"),
      finalHash: hash,
    })
    .where(
      and(
        eq(leasePackets.id, id),
        eq(leasePackets.status, "awaiting"),
        sql`not exists(select 1 from ${leaseSigners} where ${leaseSigners.packetId}=${id} and ${leaseSigners.signedAt} is null)`,
      ),
    );
  return activePacket(id);
}
