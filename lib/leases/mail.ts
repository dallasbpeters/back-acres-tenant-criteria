import { digest } from "./signing-model";
export async function sendLeaseMail(
  message: { to: string; subject: string; text: string },
  transport: typeof fetch = fetch,
) {
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL)
    throw Error("Lease email is not configured.");
  return transport("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `lease-${digest(JSON.stringify(message))}`,
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
}
