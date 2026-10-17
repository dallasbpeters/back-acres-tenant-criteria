"use client";
import { AppSelect } from "@/components/ui/select";
import { useState } from "react";
import { Field, PropertySelect, type PropertyRecord } from "./dashboard";
import { dollars } from "@/lib/management/model";
export type RentScheduleRecord = {
  id: string;
  propertyId: string;
  payerName: string;
  payerEmail: string;
  monthlyCents: number;
  firstDate: string;
  installments: number;
  mode: string;
  status: string;
  stripeScheduleId: string | null;
  collection: string;
  enrollmentUrl: string | null;
};
export function BillingWorkspace({
  properties,
  schedules,
  onSaved,
  ready,
}: {
  properties: PropertyRecord[];
  schedules: RentScheduleRecord[];
  onSaved: () => Promise<void>;
  ready: boolean;
}) {
  const [id, setId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [amount, setAmount] = useState(""),
    [count, setCount] = useState("1");
  async function post(data: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
        result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await onSaved();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save rent schedule.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-section">
      <h3>Monthly rent payments</h3>
      <p>
        Choose automatic ACH bank payments or invoices paid manually. For ACH,
        share the private enrollment link with the tenant. No automatic debit is
        scheduled until they authorize and verify their bank account with
        Stripe. Both options stop after the agreed number of monthly payments.
      </p>
      <form
        className="management-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          const ok = await post({
            action: "create",
            id,
            data: {
              collection: f.get("collection"),
              propertyId: f.get("propertyId"),
              payerName: f.get("payerName"),
              payerEmail: f.get("payerEmail"),
              monthlyCents: Math.round(Number(amount) * 100),
              firstDate: f.get("firstDate"),
              installments: Number(count),
              authorized: f.get("authorized") === "on",
            },
          });
          if (ok) {
            setId(crypto.randomUUID());
            form.reset();
            setAmount("");
            setCount("1");
          }
        }}
      >
        <fieldset disabled={busy || !ready}>
          <div className="fields">
            <AppSelect
              label={<>Payment collection</>}
              name="collection"
              defaultValue="ach"
            >
              <option value="ach">
                Automatic ACH · tenant authorization required
              </option>
              <option value="invoice">
                Monthly invoice · tenant pays manually
              </option>
            </AppSelect>
            <PropertySelect properties={properties} />
            <Field name="payerName" label="Rent payer name" />
            <Field name="payerEmail" label="Rent payer email" type="email" />
            <label className="field">
              Monthly rent amount ($)
              <input
                name="monthlyAmount"
                type="number"
                min="0.50"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <Field
              name="firstDate"
              label="First payment date (day 1–28; future date for ACH)"
              type="date"
            />
            <label className="field">
              Number of monthly payments
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                required
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </label>
          </div>
          <p>
            Total scheduled:{" "}
            {dollars(
              Math.round(Number(amount || 0) * 100) * Number(count || 0),
            )}
            . No automatic lease renewal. Enroll and verify the bank account
            before the first ACH payment date. Invoices are due when issued.
          </p>
          <label className="check-row">
            <input name="authorized" type="checkbox" required />I have checked
            the payer, amount, and agreed lease term and authorize these payment
            terms. For ACH, the tenant must provide their own bank
            authorization. Live-mode invoices and debits can collect real money.
          </label>
          <button className="submit-button" disabled={!properties.length}>
            Create rent payment schedule
          </button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {schedules.map((s) => (
        <article className="record" key={s.id}>
          <h3>
            {s.payerName} · {dollars(s.monthlyCents)} / month
          </h3>
          <p>
            {s.payerEmail} · first payment {s.firstDate} · {s.installments}{" "}
            installments
          </p>
          <p>
            {s.collection === "ach" ? "Automatic ACH" : "Manual invoices"} ·{" "}
            {s.status.replaceAll("_", " ")} · {s.mode} mode
          </p>
          {s.enrollmentUrl && (
            <p>
              <a href={s.enrollmentUrl} target="_blank" rel="noreferrer">
                Open tenant enrollment and payment controls
              </a>{" "}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(s.enrollmentUrl!);
                    setError(
                      "Enrollment link copied. Share it privately with the named payer.",
                    );
                  } catch {
                    setError("Open the enrollment page and copy its address.");
                  }
                }}
              >
                Copy private enrollment link
              </button>
            </p>
          )}
          {s.status === "needs_review" && (
            <p>
              Review this schedule in Stripe before replacing it. If bank
              verification missed the first payment date, cancel and create a
              new enrollment with a future date.
            </p>
          )}
          {s.stripeScheduleId && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`https://dashboard.stripe.com/${s.mode === "test" ? "test/" : ""}subscription_schedules/${s.stripeScheduleId}`}
            >
              Review schedule in Stripe
            </a>
          )}
          {[
            "active",
            "not_started",
            "awaiting_authorization",
            "creating_checkout",
            "awaiting_verification",
            "needs_review",
            "canceling",
          ].includes(s.status) && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Stop future rent payments? This does not cancel the lease, reverse submitted debits, or remove invoices already issued.",
                  )
                )
                  post({ action: "cancel", id: s.id });
              }}
            >
              Stop future payments
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
