import { count, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OwnerFrame } from "@/components/management/owner-frame";
import { SectionCard } from "@/components/management/section-card";
import { OwnerSignIn } from "@/components/management/sign-in";
import { authenticated } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import {
  authorizationReceipts,
  invoices,
  paymentHistory,
  paymentRecoveryRuns,
} from "@/lib/db/schema";
import { dollars } from "@/lib/management/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment activity | Back Acres" };
export default async function PaymentActivity({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  if (!(await authenticated())) {
    return (
      <OwnerFrame signedIn={false} title="Payment activity">
        <OwnerSignIn />
      </OwnerFrame>
    );
  }
  const { invoice } = await searchParams;
  if (invoice && !z.string().uuid().safeParse(invoice).success) {
    notFound();
  }
  const d = db();
  const [entries, pending, runs] = await Promise.all([
    d
      .select({
        description: invoices.description,
        history: paymentHistory,
        payerName: invoices.payerName,
      })
      .from(paymentHistory)
      .innerJoin(invoices, eq(paymentHistory.invoiceId, invoices.id))
      .where(invoice ? eq(paymentHistory.invoiceId, invoice) : undefined)
      .orderBy(desc(paymentHistory.observedAt))
      .limit(200),
    d
      .select({ total: count() })
      .from(authorizationReceipts)
      .where(isNull(authorizationReceipts.acceptedAt)),
    d
      .select()
      .from(paymentRecoveryRuns)
      .orderBy(desc(paymentRecoveryRuns.startedAt))
      .limit(5),
  ]);
  const [latest] = runs;
  const stale =
    latest?.status !== "complete" ||
    Date.now() - latest.startedAt.getTime() > 36 * 3_600_000;
  return (
    <OwnerFrame signedIn title="Payment activity">
      <p>
        <a href="/admin#payments">← Payments workspace</a>
      </p>
      <SectionCard labelledBy="recovery-heading">
        <h2 id="recovery-heading">Recovery and authorization copies</h2>
        <p role={stale ? "status" : undefined}>
          {stale
            ? "Review needed: the daily payment recovery job has no recent successful run."
            : `Last recovery completed ${latest.completedAt?.toLocaleString("en-US", { timeZone: "America/Chicago" })}.`}
        </p>
        <p>
          {pending[0].total} authorization copies awaiting email acceptance.
          Acceptance by Resend does not prove inbox delivery.
        </p>
        <p className="small-note">
          Recovery checks three days of Stripe events, up to 500 per run. It
          never creates charges or retries debits. Review failed jobs in Vercel;
          longer outages require manual reconciliation in Stripe.
        </p>
      </SectionCard>
      <SectionCard labelledBy="invoice-activity-heading">
        <h2 id="invoice-activity-heading">
          {invoice ? "Invoice activity" : "Recent invoice activity"}
        </h2>
        <p className="small-note">
          Latest 200 changes. Baseline entries show the state when history
          tracking began; they do not reconstruct earlier transactions. Amounts
          are invoice amounts and cumulative refunds, not individual charge or
          payout accounting.
        </p>
        {entries.length ? (
          <div className="tenant-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Recorded</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Status</th>
                  <th scope="col">Invoice amount</th>
                  <th scope="col">Refunded to date</th>
                  <th scope="col">Environment</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(({ history, description, payerName }) => (
                  <tr key={history.id}>
                    <td>
                      {history.observedAt.toLocaleString("en-US", {
                        timeZone: "America/Chicago",
                      })}
                      {history.source === "migration_baseline" && (
                        <small> · Baseline</small>
                      )}
                    </td>
                    <td>
                      {description}
                      <br />
                      {payerName}
                    </td>
                    <td>
                      {history.previousStatus
                        ? `${history.previousStatus} → `
                        : ""}
                      {history.status}
                    </td>
                    <td>{dollars(history.amountCents)}</td>
                    <td>{dollars(history.refundedCents)}</td>
                    <td>{history.mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No recorded activity for this selection.</p>
        )}
      </SectionCard>
    </OwnerFrame>
  );
}
