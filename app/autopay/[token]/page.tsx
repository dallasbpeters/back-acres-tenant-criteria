import { notRemoved } from "@/lib/management/not-removed";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rentSchedules, properties } from "@/lib/db/schema";
import { tokenId } from "@/lib/management/security";
import { paymentReady, paymentMode, stripe } from "@/lib/management/stripe";
import { authorizationText } from "@/lib/management/autopay";
import { dollars } from "@/lib/management/model";
import { ManagementShell } from "@/components/management/shell";
import { AutopayControls } from "@/components/management/autopay";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Automatic ACH rent payments | Back Acres",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};
export default async function AutopayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params,
    id = tokenId("autopay", token);
  if (!id) notFound();
  const [r] = await db()
    .select()
    .from(rentSchedules)
    .where(and(eq(rentSchedules.id, id), notRemoved(rentSchedules.id)));
  if (!r || r.collection !== "ach") notFound();
  const [p] = await db()
    .select()
    .from(properties)
    .where(eq(properties.id, r.propertyId));
  const ready = paymentReady() && r.mode === paymentMode();
  let bankSetupOpen = false;
  let verificationUrl: string | undefined;
  if (ready && r.setupSessionId && r.status === "awaiting_verification") {
    try {
      const session = await stripe().checkout.sessions.retrieve(
        r.setupSessionId,
        { expand: ["setup_intent"] },
      );
      bankSetupOpen = session.status === "open";
      const intent = session.setup_intent;
      if (intent && typeof intent !== "string")
        verificationUrl =
          intent.next_action?.verify_with_microdeposits
            ?.hosted_verification_url;
    } catch {
      /* The stored enrollment state remains visible during provider outages. */
    }
  }
  const closed = ["canceled", "completed", "released"].includes(r.status);
  return (
    <ManagementShell title="Automatic ACH rent payments">
      <p>
        {p?.data.name} · {r.payerName}
      </p>
      {r.mode === "test" && (
        <p className="draft-banner">
          Test mode. No real bank account will be debited. Use Stripe test bank
          details only.
        </p>
      )}
      <dl className="document-details">
        <div>
          <dt>Monthly rent</dt>
          <dd>{dollars(r.monthlyCents)}</dd>
        </div>
        <div>
          <dt>First debit date</dt>
          <dd>{r.firstDate}</dd>
        </div>
        <div>
          <dt>Monthly payments</dt>
          <dd>{r.installments}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{r.status.replaceAll("_", " ")}</dd>
        </div>
      </dl>
      <h2>Payment authorization</h2>
      <p>{r.authorizationText || authorizationText(r)}</p>
      <p>
        Keep this link private. Save or print this page for your records. Bank
        details are entered directly with Stripe and are not stored by Back
        Acres.
      </p>
      {verificationUrl && (
        <p>
          <a href={verificationUrl} rel="noreferrer">
            Verify your bank account with Stripe
          </a>
        </p>
      )}
      {r.status === "awaiting_verification" && (
        <p role="status">
          Finish bank verification with Stripe. Automatic payments start only
          after verification and scheduling are confirmed. Refresh this page for
          status.
        </p>
      )}
      {r.status === "not_started" && (
        <p role="status">
          Your bank account is authorized. Automatic debits are scheduled to
          begin on {r.firstDate}. Bank payments may take several business days
          to settle.
        </p>
      )}
      {r.status === "needs_review" && (
        <p role="status">
          This enrollment needs owner review. No new enrollment can start here.
          Contact the owner before paying another way.
        </p>
      )}
      {closed && (
        <p role="status">
          Future automatic payments have stopped. Payments already submitted may
          still complete. Your rent obligation and lease remain in effect.
        </p>
      )}
      {ready && (
        <AutopayControls
          token={token}
          enroll={
            (r.status === "awaiting_authorization" || bankSetupOpen) &&
            !verificationUrl &&
            r.firstDate > new Date().toISOString().slice(0, 10)
          }
          stop={!closed}
        />
      )}
      <p className="small-note">
        Questions or changes to your bank account: contact {p?.data.contact}. To
        change banks, stop this authorization and ask the owner for a new
        enrollment. Do not pay the same rent obligation twice.
      </p>
    </ManagementShell>
  );
}
