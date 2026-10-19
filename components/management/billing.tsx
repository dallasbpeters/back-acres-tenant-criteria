// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import posthog from "posthog-js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import { dollars } from "@/lib/management/model";
import { terminalSchedules } from "@/lib/management/removal";
import { requireValue } from "@/lib/required";
import { Field, type PropertyRecord, PropertySelect } from "./dashboard";
import { RenterSharing, useRenters } from "./payment-renters";
import { RemoveButton } from "./remove-button";
export interface RentScheduleRecord {
  collection: string;
  enrollmentUrl: string | null;
  firstDate: string;
  id: string;
  installments: number;
  mode: string;
  monthlyCents: number;
  payerEmail: string;
  payerName: string;
  propertyId: string;
  status: string;
  stripeScheduleId: string | null;
}
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
    [count, setCount] = useState("1"),
    [renterKey, setRenterKey] = useState("");
  const { renters, share } = useRenters();
  const picked = renters.find((r) => `${r.type}-${r.id}` === renterKey);
  async function post(data: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/billing", {
          body: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
        result = await response.json();
      if (!response.ok) {
        throw new Error(result.error);
      }
      await onSaved();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save rent schedule."
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
            data: {
              authorized: f.get("authorized") === "on",
              collection: f.get("collection"),
              firstDate: f.get("firstDate"),
              installments: Number(count),
              monthlyCents: Math.round(Number(amount) * 100),
              payerEmail: f.get("payerEmail"),
              payerName: f.get("payerName"),
              propertyId: f.get("propertyId"),
            },
            id,
          });
          if (ok && picked) {
            // The new schedule shows in this renter's portal right away.
            await share(picked, "schedule", id, true);
          }
          if (ok) {
            posthog.capture("rent_payment_schedule_created", {
              collection: String(f.get("collection")),
            });
            setId(crypto.randomUUID());
            form.reset();
            setAmount("");
            setCount("1");
            setRenterKey("");
          }
        }}
      >
        <fieldset disabled={busy || !ready}>
          <div className="fields">
            <AppSelect
              defaultValue="ach"
              label={<>Payment collection</>}
              name="collection"
            >
              <option value="ach">
                Automatic ACH · tenant authorization required
              </option>
              <option value="invoice">
                Monthly invoice · tenant pays manually
              </option>
            </AppSelect>
            {renters.length > 0 && (
              <AppSelect
                label="Renter"
                onValueChange={setRenterKey}
                value={renterKey}
              >
                <option value="">
                  Choose a renter, or type the payer below
                </option>
                {renters.map((renter) => (
                  <option
                    key={`${renter.type}-${renter.id}`}
                    value={`${renter.type}-${renter.id}`}
                  >
                    {renter.name}
                    {renter.type === "invitation" ? " (invited)" : ""}
                  </option>
                ))}
              </AppSelect>
            )}
            <PropertySelect
              defaultValue={picked?.propertyId}
              key={`property-${renterKey}`}
              properties={properties}
            />
            <Field
              key={`name-${renterKey}`}
              label="Rent payer name"
              name="payerName"
              value={picked?.name}
            />
            <Field
              key={`email-${renterKey}`}
              label="Rent payer email"
              name="payerEmail"
              type="email"
              value={picked?.email || undefined}
            />
            <label className="field">
              Monthly rent amount ($)
              <input
                min="0.50"
                name="monthlyAmount"
                onChange={(e) => setAmount(e.target.value)}
                required
                step="0.01"
                type="number"
                value={amount}
              />
            </label>
            <Field
              label="First payment date (day 1–28; future date for ACH)"
              name="firstDate"
              type="date"
            />
            <label className="field">
              Number of monthly payments
              <input
                max="60"
                min="1"
                onChange={(e) => setCount(e.target.value)}
                required
                step="1"
                type="number"
                value={count}
              />
            </label>
          </div>
          <p>
            Total scheduled:{" "}
            {dollars(
              Math.round(Number(amount || 0) * 100) * Number(count || 0)
            )}
            . No automatic lease renewal. Enroll and verify the bank account
            before the first ACH payment date. Invoices are due when issued.
          </p>
          <label className="check-row">
            <input name="authorized" required type="checkbox" />I have checked
            the payer, amount, and agreed lease term and authorize these payment
            terms. For ACH, the tenant must provide their own bank
            authorization. Live-mode invoices and debits can collect real money.
          </label>
          <Button
            className="submit-button"
            disabled={!properties.length}
            type="submit"
            variant="primary"
          >
            Create rent payment schedule
          </Button>
        </fieldset>
      </form>
      {!!error && <p role="alert">{error}</p>}
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
          <RenterSharing
            kind="schedule"
            propertyId={s.propertyId}
            recordId={s.id}
          />
          <RemoveButton
            cancelFirst={!terminalSchedules.includes(s.status)}
            disabled={busy}
            id={s.id}
            kind="rentSchedule"
            name={s.payerName}
            onRemoved={onSaved}
          />
          {!!s.enrollmentUrl && (
            <p>
              <a href={s.enrollmentUrl} rel="noreferrer" target="_blank">
                Open tenant enrollment and payment controls
              </a>{" "}
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      requireValue(s.enrollmentUrl, "Expected s.enrollmentUrl")
                    );
                    setError(
                      "Enrollment link copied. Share it privately with the named payer."
                    );
                  } catch {
                    setError("Open the enrollment page and copy its address.");
                  }
                }}
                type="submit"
              >
                Copy private enrollment link
              </Button>
            </p>
          )}
          {!!(s.status === "needs_review") && (
            <p>
              Review this schedule in Stripe before replacing it. If bank
              verification missed the first payment date, cancel and create a
              new enrollment with a future date.
            </p>
          )}
          {!!s.stripeScheduleId && (
            <a
              href={`https://dashboard.stripe.com/${s.mode === "test" ? "test/" : ""}subscription_schedules/${s.stripeScheduleId}`}
              rel="noreferrer"
              target="_blank"
            >
              Review schedule in Stripe
            </a>
          )}
          {!![
            "active",
            "not_started",
            "awaiting_authorization",
            "creating_checkout",
            "awaiting_verification",
            "needs_review",
            "canceling",
          ].includes(s.status) && (
            <Button
              disabled={busy}
              onClick={() => {
                if (
                  /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
                    "Stop future rent payments? This does not cancel the lease, reverse submitted debits, or remove invoices already issued."
                  )
                ) {
                  post({ action: "cancel", id: s.id });
                }
              }}
              type="submit"
            >
              Stop future payments
            </Button>
          )}
        </article>
      ))}
    </section>
  );
}
