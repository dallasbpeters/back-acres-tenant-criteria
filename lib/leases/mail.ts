import { digest } from "./signing-model";
export async function sendLeaseMail(
  message: { to: string; subject: string; text: string },
  transport: typeof fetch = fetch
) {
  if (!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL)) {
    throw new Error("Lease email is not configured.");
  }
  return await transport("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
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
