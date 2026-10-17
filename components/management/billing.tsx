"use client";
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
      <h3>Recurring rent invoices</h3>
      <p>
        Stripe issues one invoice per month for the number of installments you
        set, then stops. Tenants pay each hosted invoice themselves. This does
        not enroll anyone in autopay or sign, renew, or cancel a lease.
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
            <PropertySelect properties={properties} />
            <Field name="payerName" label="Rent payer name" />
            <Field name="payerEmail" label="Rent payer email" type="email" />
            <label className="field">
              Monthly invoice amount ($)
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
              label="First invoice date (day 1–28)"
              type="date"
            />
            <label className="field">
              Number of monthly invoices
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
            . No automatic lease renewal. Invoices are due when issued.
          </p>
          <label className="check-row">
            <input name="authorized" type="checkbox" required />I have checked
            the payer, amount, and agreed lease term and authorize these
            invoices. I understand live-mode schedules can email real invoices.
          </label>
          <button className="submit-button" disabled={!properties.length}>
            Create rent invoice schedule
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
            {s.payerEmail} · first invoice {s.firstDate} · {s.installments}{" "}
            installments
          </p>
          <p>
            {s.status} · {s.mode} mode
          </p>
          {s.stripeScheduleId && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`https://dashboard.stripe.com/${s.mode === "test" ? "test/" : ""}subscription_schedules/${s.stripeScheduleId}`}
            >
              Review schedule in Stripe
            </a>
          )}
          {["active", "not_started"].includes(s.status) && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Stop future rent invoices? This does not cancel the lease or remove invoices already issued.",
                  )
                )
                  post({ action: "cancel", id: s.id });
              }}
            >
              Cancel future invoices
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
