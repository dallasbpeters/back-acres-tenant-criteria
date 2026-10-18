import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
export const SIGNING_CONSENT =
  "I have reviewed this lease and can open and retain its PDF. I agree to use electronic records and signatures for this lease. I intend my signature to sign this exact lease and agree to its terms. I may choose paper before signing, request paper copies, update my email, or withdraw consent for future electronic records by contacting the landlord. Withdrawal does not undo a signature already made. This website charges no fee for these requests. I have access to this email address, a web browser and a PDF reader, and can save or print the document.";
export const SIGNING_CONSENT_VERSION = "lease-esign-v1";
export const signerInput = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.email().transform((v) => v.toLowerCase()),
  role: z.enum(["tenant", "landlord"]),
});
export const packetInput = z
  .object({
    draftId: z.uuid(),
    reviewed: z.literal(true),
    signers: z.array(signerInput).min(2).max(12),
  })
  .superRefine((v, ctx) => {
    if (
      !v.signers.some((s) => s.role === "tenant") ||
      !v.signers.some((s) => s.role === "landlord")
    )
      ctx.addIssue({
        code: "custom",
        message: "Add every tenant and a landlord.",
      });
    if (new Set(v.signers.map((s) => s.email)).size !== v.signers.length)
      ctx.addIssue({
        code: "custom",
        message: "Each signer needs a separate email address.",
      });
  });
export const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export function codeDigest(token: string, code: string) {
  if (!process.env.NEXTAUTH_SECRET) throw Error("Signing is not configured.");
  return createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(`${token}:${code}`)
    .digest("hex");
}
export function signingEvidence(data: {
  packetId: string;
  documentHash: string;
  signerId: string;
  name: string;
  email: string;
  role: string;
  signatureHash: string;
  consent: string;
  consentVersion: string;
  signedAt: string;
  verifiedAt: string;
  pdfViewedAt: string;
  ip: string;
  userAgent: string;
}) {
  const canonical = JSON.stringify(data);
  return { canonical, hash: digest(canonical) };
}
export function signingText(value: string) {
  return value
    .replace(/TEXAS RESIDENTIAL LEASE - DRAFT/g, "TEXAS RESIDENTIAL LEASE")
    .replace(
      /Draft only\. No signatures have been collected by this website\./g,
      "Electronic signatures are attached in the signature audit record.",
    )
    .replace(
      /No receipt or signature is recorded by preparing this draft\./g,
      "Preparing this document alone does not acknowledge receipt.",
    );
}
