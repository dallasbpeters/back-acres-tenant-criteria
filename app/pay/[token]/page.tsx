import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/management/checkout";
import { ManagementShell } from "@/components/management/shell";
import { db } from "@/lib/db";
import { invoices, properties } from "@/lib/db/schema";
import { dollars } from "@/lib/management/model";
import { notRemoved } from "@/lib/management/not-removed";
import { tokenId } from "@/lib/management/security";
import { paymentMode, paymentReady } from "@/lib/management/stripe";
export const dynamic = "force-dynamic";
export const metadata = {
  referrer: "no-referrer" as const,
  title: "Payment request | Back Acres",
};
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{
    submitted?: string;
  }>;
}) {
  const { token } = await params;
  const id = tokenId("payment", token);
  if (!id) {
    notFound();
  }
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), notRemoved(invoices.id)));
  if (!invoice) {
    notFound();
  }
  const [p] = await db()
    .select()
    .from(properties)
    .where(eq(properties.id, invoice.propertyId));
  const { submitted } = await searchParams;
  const ready = paymentReady() && invoice.mode === paymentMode();
  const resolveResult1 = () => {
    if (invoice.status === "void") {
      return (
        <p>
          This payment request was canceled. Contact{" "}
          {p?.data.contact || "Back Acres Rentals"} with questions.
        </p>
      );
    }
    if (invoice.status === "paid") {
      return <p role="status">Payment received. Reference: {invoice.id}</p>;
    }
    if (invoice.status === "processing" || submitted) {
      return (
        <p role="status">
          Your checkout was submitted. Payment is not confirmed until the
          payment provider reports success. Bank payments may take several
          business days. Refresh this page for status; do not pay again while
          processing.
        </p>
      );
    }
    if (ready) {
      return <Checkout token={token} />;
    }
    return (
      <p>
        Online payment setup is pending. Contact{" "}
        {p?.data.contact || "Back Acres Rentals"}.
      </p>
    );
  };
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
      {!!(invoice.mode === "test") && (
        <p className="draft-banner">
          Test mode. No real payment will be collected.
        </p>
      )}
      {resolveResult1()}
      <p className="small-note">
        Payments are processed by Stripe. Card and bank details are entered
        directly with Stripe. Questions or refund requests: {p?.data.contact}.
        Paying an application fee does not approve an application; paying a
        deposit does not by itself create a lease.
      </p>
    </ManagementShell>
  );
}
