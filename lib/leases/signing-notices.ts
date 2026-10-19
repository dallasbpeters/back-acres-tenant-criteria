import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaseSigners } from "@/lib/db/schema";
import { currentEmailBrand } from "@/lib/email-brand";
import { siteUrl } from "@/lib/management/security";
import { sendLeaseMail } from "./mail";
import { activePacket } from "./signing-store";

const when = (value: Date) =>
  value.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });
const names = (list: { name: string }[]) =>
  list.map((s) => s.name).join(" and ");

type Mail = Parameters<typeof sendLeaseMail>[0];
type Signer = typeof leaseSigners.$inferSelect;
interface Context {
  brand: Mail["brand"];
  brandName: string;
  owner: string;
  portal: string;
}
const linkFor = (role: string, c: Context) =>
  role === "tenant"
    ? { label: "Open your tenant portal", url: c.portal }
    : { label: "Open the owner workspace", url: c.owner };

/** Everyone gets the signed PDF once the last signature lands. */
function completionMails(signers: Signer[], finalPdf: string, c: Context) {
  return signers.map((person): Mail => {
    const where =
      person.role === "tenant"
        ? "You can also download it from your tenant portal."
        : "It is also in the owner workspace under Leases.";
    const body = `Hello ${person.name},\n\nEveryone has signed the lease. The signed lease is attached. ${where}`;
    const link = linkFor(person.role, c);
    return {
      action: link,
      attachments: [{ content: finalPdf, filename: "signed-lease.pdf" }],
      brand: c.brand,
      htmlText: body,
      subject: `${c.brandName}: your lease is fully signed`,
      text: `${body}\n\n${link.url}`,
      to: person.email,
    };
  });
}

/** A receipt for the signer, and a note to the landlord that someone signed. */
function progressMails(signer: Signer, signers: Signer[], c: Context) {
  const waiting = signers.filter((s) => !s.signedAt);
  const receipt = `Hello ${signer.name},\n\nYour signature on the lease was recorded on ${when(signer.signedAt as Date)} (Central). We are waiting for ${names(waiting)} to sign. We will email you the signed lease when everyone has signed.`;
  const link = linkFor(signer.role, c);
  const mails: Mail[] = [
    {
      action: link,
      brand: c.brand,
      htmlText: receipt,
      subject: `${c.brandName}: you signed your lease`,
      text: `${receipt}\n\n${link.url}`,
      to: signer.email,
    },
  ];
  if (signer.role === "landlord") {
    return mails;
  }
  for (const landlord of signers.filter(
    (s) => s.role === "landlord" && s.id !== signer.id
  )) {
    const note = `Hello ${landlord.name},\n\n${signer.name} signed the lease. Still waiting for ${names(waiting)}.`;
    mails.push({
      action: { label: "Open the owner workspace", url: c.owner },
      brand: c.brand,
      htmlText: note,
      subject: `${c.brandName}: ${signer.name} signed the lease`,
      text: `${note}\n\n${c.owner}`,
      to: landlord.email,
    });
  }
  return mails;
}

/**
 * Emails after one signature: a receipt to the signer, a note to the
 * landlord, and the signed PDF to everyone at the end. A failed email is
 * logged and never undoes the signature.
 */
export async function sendSigningNotices(packetId: string, signerId: string) {
  const packet = await activePacket(packetId);
  if (!packet) {
    return;
  }
  const signers = await db()
    .select()
    .from(leaseSigners)
    .where(eq(leaseSigners.packetId, packetId));
  const signer = signers.find((s) => s.id === signerId);
  if (!signer?.signedAt) {
    return;
  }
  const context: Context = {
    brand: await currentEmailBrand(packet.brandName),
    brandName: packet.brandName,
    owner: `${siteUrl()}/admin`,
    portal: `${siteUrl()}/tenant`,
  };
  const mails =
    packet.status === "completed" && packet.finalPdf
      ? completionMails(signers, packet.finalPdf, context)
      : progressMails(signer, signers, context);
  const results = await Promise.allSettled(
    mails.map((mail) => sendLeaseMail(mail))
  );
  for (const result of results) {
    if (result.status === "rejected" || !result.value.ok) {
      console.error(
        "Lease signing notice failed",
        result.status === "rejected"
          ? String(result.reason)
          : `status ${result.value.status}`
      );
    }
  }
}
