import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { guard, reply } from "@/lib/adverse/auth";
import { authOptions } from "@/lib/adverse/google-auth";
import { currentEmailBrand } from "@/lib/email-brand";
import { sendLeaseMail } from "@/lib/leases/mail";
import { allowIntake } from "@/lib/management/security";

export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) {
    return denied;
  }
  const recipient = (await getServerSession(authOptions))?.user?.email;
  if (!recipient) {
    return reply({ error: "Please sign in again." }, 401);
  }
  if (!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL)) {
    return reply(
      { error: "The sender and Resend key must be configured." },
      503
    );
  }
  try {
    if (!(await allowIntake(request, `owner-email-test:${recipient}`))) {
      return reply(
        { error: "Test email limit reached. Please try later." },
        429
      );
    }
    const reference = randomUUID();
    // The recipient, subject and body are server-controlled. Never send arbitrary owner input.
    const response = await sendLeaseMail({
      brand: await currentEmailBrand(),
      subject: "Back Acres Rentals — email delivery test",
      text: `This is a test email from Back Acres Rentals.\n\nYou requested this delivery check from the owner workspace. It does not create a lease, payment obligation, application decision or tenant record.\n\nSender: ${process.env.FROM_EMAIL}\nTest reference: ${reference}\nSent at: ${new Date().toISOString()}\n\nhttps://backacresrentals.com`,
      to: recipient,
    });
    if (!response.ok) {
      return reply(
        {
          error: `Resend rejected the test email (HTTP ${response.status}). Check the sending key and verified domain.`,
        },
        502
      );
    }
    const result = await response.json();
    if (typeof result.id !== "string" || !result.id) {
      return reply(
        {
          error:
            "Resend did not return a delivery reference. Check its email logs before retrying.",
        },
        502
      );
    }
    return reply({ id: result.id, recipient, sender: process.env.FROM_EMAIL });
  } catch {
    return reply(
      {
        error:
          "Could not confirm the test email. Check Resend logs before retrying.",
      },
      503
    );
  }
}
