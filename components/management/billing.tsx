// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import posthog from "posthog-js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OverflowAction } from "@/components/ui/overflow-menu";
import { AppSelect } from "@/components/ui/select";
import { dollars } from "@/lib/management/model";
import { terminalSchedules } from "@/lib/management/removal";
import { Field, type PropertyRecord, PropertySelect } from "./dashboard";
import { RenterSharing, useRenters } from "./payment-renters";
import { CopyLinkButton, PaymentRow, type StatusTone } from "./payment-row";
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
    [renterKey, setRenterKey] = useState(""),
    [formOpen, setFormOpen] = useState(false),
    [removing, setRemoving] = useState<string | null>(null);
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

  const closeRemove = (open: boolean) => {
    if (!open) {
      setRemoving(null);
    }
  };
  const target = schedules.find((s) => s.id === removing);
  return (
    <section aria-labelledby="rent-schedules" className="payment-section">
      <div className="payment-section-head">
        <div>
          <h3 id="rent-schedules">Rent schedules</h3>
          <p className="small-note">
            Monthly rent by automatic bank debit or monthly invoice. Debits
            start only after the tenant connects their bank with the private
            enrollment link.
          </p>
        </div>
        {!formOpen && (
          <Button
            disabled={!ready}
            onPress={() => setFormOpen(true)}
            variant="primary"
          >
            New rent schedule
          </Button>
        )}
      </div>
      {!!formOpen && (
        <form
          className="management-form payment-form-panel"
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
              setFormOpen(false);
            }
          }}
        >
          <fieldset disabled={busy || !ready}>
            <div className="fields">
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
              <AppSelect
                defaultValue="ach"
                label={<>How rent is collected</>}
                name="collection"
              >
                <option value="ach">Automatic bank debit (ACH)</option>
                <option value="invoice">Monthly invoice, paid by tenant</option>
              </AppSelect>
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
            <p className="payment-form-total">
              Total scheduled:{" "}
              {dollars(
                Math.round(Number(amount || 0) * 100) * Number(count || 0)
              )}
              . No automatic lease renewal. Enroll and verify the bank account
              before the first ACH payment date. Invoices are due when issued.
            </p>
            <label className="check-row">
              <input name="authorized" required type="checkbox" />I have checked
              the payer, amount, and agreed lease term and authorize these
              payment terms. For ACH, the tenant must provide their own bank
              authorization. Live-mode invoices and debits can collect real
              money.
            </label>
            <div className="management-actions">
              <Button
                disabled={!properties.length}
                type="submit"
                variant="primary"
              >
                Create rent schedule
              </Button>
              <Button onPress={() => setFormOpen(false)} variant="quiet">
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {!!error && <p role="alert">{error}</p>}
      {schedules.length ? (
        <ul className="payment-rows">
          {schedules.map((s) => (
            <PaymentRow
              actions={scheduleActions(s, {
                remove: () => setRemoving(s.id),
                stop: () => {
                  if (
                    // biome-ignore lint/suspicious/noAlert: Stopping payments needs an explicit confirmation.
                    window.confirm(
                      "Stop future rent payments? This does not cancel the lease, reverse submitted debits, or remove invoices already issued."
                    )
                  ) {
                    post({ action: "cancel", id: s.id });
                  }
                },
              })}
              amount={`${dollars(s.monthlyCents)} / month`}
              key={s.id}
              meta={`${s.collection === "ach" ? "Bank debit" : "Monthly invoice"} · ${s.installments} payments from ${s.firstDate} · ${s.payerEmail}`}
              primary={
                s.enrollmentUrl && !terminalSchedules.includes(s.status) ? (
                  <CopyLinkButton
                    label="Copy enrollment link"
                    url={s.enrollmentUrl}
                  />
                ) : undefined
              }
              status={scheduleStatus(s.status)}
              test={s.mode === "test"}
              title={s.payerName}
            >
              {s.status === "needs_review" && (
                <p className="small-note">
                  Review this schedule in Stripe before replacing it. If bank
                  verification missed the first payment date, stop it and create
                  a new one with a future date.
                </p>
              )}
              <RenterSharing
                kind="schedule"
                propertyId={s.propertyId}
                recordId={s.id}
              />
            </PaymentRow>
          ))}
        </ul>
      ) : (
        <p className="tenant-empty-state">No rent schedules yet.</p>
      )}
      {!!target && (
        <RemoveButton
          cancelFirst={!terminalSchedules.includes(target.status)}
          disabled={busy}
          id={target.id}
          kind="rentSchedule"
          name={target.payerName}
          onOpenChange={closeRemove}
          onRemoved={onSaved}
          open
        />
      )}
    </section>
  );
}

const scheduleLabels: Record<string, { label: string; tone: StatusTone }> = {
  activating: { label: "Starting", tone: "waiting" },
  active: { label: "Active", tone: "active" },
  awaiting_authorization: {
    label: "Waiting for tenant's bank",
    tone: "waiting",
  },
  awaiting_verification: { label: "Verifying bank", tone: "waiting" },
  canceled: { label: "Stopped", tone: "done" },
  canceling: { label: "Stopping", tone: "waiting" },
  completed: { label: "Completed", tone: "done" },
  creating: { label: "Setting up", tone: "waiting" },
  creating_checkout: { label: "Bank setup started", tone: "waiting" },
  needs_review: { label: "Needs review", tone: "attention" },
  not_started: { label: "Scheduled", tone: "active" },
  released: { label: "Released", tone: "done" },
};
function scheduleStatus(status: string) {
  return (
    scheduleLabels[status] ?? {
      label: status.replaceAll("_", " "),
      tone: "waiting" as const,
    }
  );
}
const stoppable = new Set([
  "active",
  "not_started",
  "awaiting_authorization",
  "creating_checkout",
  "awaiting_verification",
  "needs_review",
  "canceling",
]);
function scheduleActions(
  s: RentScheduleRecord,
  run: { remove: () => void; stop: () => void }
): OverflowAction[] {
  return [
    ...(s.enrollmentUrl
      ? [{ href: s.enrollmentUrl, label: "Open tenant enrollment page" }]
      : []),
    ...(s.stripeScheduleId
      ? [
          {
            href: `https://dashboard.stripe.com/${s.mode === "test" ? "test/" : ""}subscription_schedules/${s.stripeScheduleId}`,
            label: "Review in Stripe",
          },
        ]
      : []),
    ...(stoppable.has(s.status)
      ? [{ label: "Stop future payments", onAction: run.stop }]
      : []),
    { label: "Remove", onAction: run.remove, tone: "danger" as const },
  ];
}
