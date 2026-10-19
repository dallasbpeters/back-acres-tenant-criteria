import {
  brandedEmailHtml,
  defaultEmailBrand,
  type EmailBrand,
  emailButtonHtml,
  textEmailHtml,
} from "@/lib/email-layout";
import { digest } from "./signing-model";
export async function sendLeaseMail(
  {
    brand = defaultEmailBrand,
    ...message
  }: {
    /** Main link, shown as a button in the HTML version. */
    action?: { label: string; url: string };
    brand?: EmailBrand;
    /** HTML text after the button. */
    htmlAfter?: string;
    /** HTML text before the button, when it differs from `text`. */
    htmlText?: string;
    subject: string;
    text: string;
    to: string;
  },
  transport: typeof fetch = fetch
) {
  if (!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL)) {
    throw new Error("Lease email is not configured.");
  }
  return await transport("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      html: brandedEmailHtml(
        brand,
        textEmailHtml(message.htmlText ?? message.text) +
          (message.action
            ? emailButtonHtml(brand, message.action.label, message.action.url)
            : "") +
          (message.htmlAfter ? textEmailHtml(message.htmlAfter) : "")
      ),
      subject: message.subject,
      text: message.text,
      to: [message.to],
    }),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `lease-${digest(JSON.stringify(message))}`,
    },
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
}
