import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { tokenId, siteUrl, allowIntake } from "@/lib/management/security";
import { stripe, paymentReady, paymentMode } from "@/lib/management/stripe";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid origin." }, 403);
  if (!paymentReady())
    return reply(
      { error: "Online payments are not available yet. Contact the owner." },
      503,
    );
  const b = z
    .object({ token: z.string().max(110) })
    .safeParse(await readBody(request).catch(() => null));
  if (!b.success) return reply({ error: "Invalid payment link." }, 400);
  try {
    const id = tokenId("payment", b.data.token);
    if (!id) return reply({ error: "Invalid payment link." }, 404);
    const d = db();
    const [invoice] = await d
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    if (!invoice) return reply({ error: "Payment request not found." }, 404);
    if(invoice.mode!==paymentMode())return reply({error:"This request belongs to a different payment environment. Ask the owner for a new payment link."},409);
    if (invoice.status === "void")
      return reply({ error: "This payment request was canceled." }, 410);
    if (invoice.status === "paid")
      return reply({ error: "This payment has already been received." }, 409);
    if (!(await allowIntake(request, `payment:${id}`)))
      return reply({ error: "Please wait before trying again." }, 429);
    const client = stripe();
    let session;
    if (invoice.stripeSessionId) {
      session = await client.checkout.sessions.retrieve(
        invoice.stripeSessionId,
      );
    } else {
      const [claim] = await d
        .update(invoices)
        .set({ status: "creating_checkout" })
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.status, "open"),
            isNull(invoices.stripeSessionId),
          ),
        )
        .returning();
      if (!claim)
        return reply(
          {
            error:
              "Checkout is already being prepared or requires owner review. Please do not start another payment.",
          },
          409,
        );
      session = await client.checkout.sessions.create(
        {
          mode: "payment",
          integration_identifier: `back-acres-checkout-${id
            .replaceAll("-", "")
            .slice(0, 8)
            .split("")
            .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
            .join("")}`,
          customer_email: invoice.payerEmail,
          client_reference_id: invoice.id,
          metadata: { invoiceId: invoice.id },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: invoice.amountCents,
                product_data: { name: invoice.description },
              },
            },
          ],
          success_url: `${siteUrl()}/pay/${b.data.token}?submitted=1`,
          cancel_url: `${siteUrl()}/pay/${b.data.token}`,
        },
        { idempotencyKey: `rental-invoice-${id}` },
      );
      await d
        .update(invoices)
        .set({ stripeSessionId: session.id, status: "open" })
        .where(and(eq(invoices.id, id), eq(invoices.status,"creating_checkout"), isNull(invoices.stripeSessionId)));
    }
    if (session.status !== "open" || !session.url)
      return reply(
        {
          error:
            "This checkout is processing, completed, or expired. Contact the owner before making another payment.",
        },
        409,
      );
    return reply({ url: session.url });
  } catch {
    return reply(
      {
        error:
          "Could not open secure checkout. Please try again or contact the owner.",
      },
      503,
    );
  }
}
