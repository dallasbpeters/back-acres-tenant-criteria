import { notRemoved } from "@/lib/management/not-removed";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { invoices, properties } from "@/lib/db/schema";
import { tokenId } from "@/lib/management/security";
import { paymentReady, paymentMode } from "@/lib/management/stripe";
import { dollars } from "@/lib/management/model";
import { ManagementShell } from "@/components/management/shell";
import { Checkout } from "@/components/management/checkout";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Payment request | Back Acres",
  referrer: "no-referrer" as const,
};
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { token } = await params;
  const id = tokenId("payment", token);
  if (!id) notFound();
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), notRemoved(invoices.id)));
  if (!invoice) notFound();
  const [p] = await db()
    .select()
    .from(properties)
    .where(eq(properties.id, invoice.propertyId));
  const submitted = (await searchParams).submitted;
  const ready = paymentReady() && invoice.mode === paymentMode();
  return (
    <ManagementShell title="Payment request">
      <p>
        {p?.data.name} · {invoice.payerName}
      </p>
      <dl className="document-details">
        <div>
          <dt>Amount</dt>
          <dd>{dollars(invoice.amountCents)}</dd>
        </div>
        <div>
          <dt>For</dt>
          <dd>{invoice.description}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{invoice.dueDate}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{invoice.status}</dd>
        </div>
      </dl>
      {invoice.mode === "test" && (
        <p className="draft-banner">
          Test mode. No real payment will be collected.
        </p>
      )}
      {invoice.status === "void" ? (
        <p>
          This payment request was canceled. Contact the owner with questions.
        </p>
      ) : invoice.status === "paid" ? (
        <p role="status">Payment received. Reference: {invoice.id}</p>
      ) : invoice.status === "processing" || submitted ? (
        <p role="status">
          Your checkout was submitted. Payment is not confirmed until the
          payment provider reports success. Bank payments may take several
          business days. Refresh this page for status; do not pay again while
          processing.
        </p>
      ) : ready ? (
        <Checkout token={token} />
      ) : (
        <p>
          Online payment setup is pending. Contact the owner: {p?.data.contact}
        </p>
      )}
      <p className="small-note">
        Payments are processed by Stripe. Card and bank details are entered
        directly with Stripe. Questions or refund requests: {p?.data.contact}.
        Paying an application fee does not approve an application; paying a
        deposit does not by itself create a lease.
      </p>
    </ManagementShell>
  );
}
