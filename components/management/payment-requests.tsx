// biome-ignore-all lint/performance/noJsxPropsBind: Row and form controls capture the current request and form state.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OverflowAction } from "@/components/ui/overflow-menu";
import { AppSelect } from "@/components/ui/select";
import { dollars } from "@/lib/management/model";
import {
  Field,
  type InvoiceRecord,
  type PropertyRecord,
  PropertySelect,
  type Save,
} from "./dashboard";
import { RenterSharing } from "./payment-renters";
import { CopyLinkButton, PaymentRow, type StatusTone } from "./payment-row";
import { RemoveButton } from "./remove-button";

const invoiceLabels: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: "Waiting for payment", tone: "waiting" },
  paid: { label: "Paid", tone: "active" },
  processing: { label: "Processing", tone: "waiting" },
  uncollectible: { label: "Uncollectible", tone: "attention" },
  void: { label: "Canceled", tone: "done" },
};
const invoiceStatus = (status: string) =>
  invoiceLabels[status] ?? {
    label: status.replaceAll("_", " "),
    tone: "waiting" as const,
  };
const categoryLabels: Record<string, string> = {
  application_fee: "Application fee",
  deposit: "Deposit",
  other: "Other",
  rent: "Rent",
};

/** One-time charges: the list first, the form only when asked for. */
export function PaymentRequests({
  busy,
  invoices,
  onSaved,
  properties,
  propertyName,
  save,
}: {
  busy: boolean;
  invoices: InvoiceRecord[];
  onSaved: () => Promise<void>;
  properties: PropertyRecord[];
  propertyName: (id: string) => string | undefined;
  save: Save;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const target = invoices.find((i) => i.id === removing);
  return (
    <section aria-labelledby="payment-requests" className="payment-section">
      <div className="payment-section-head">
        <div>
          <h3 id="payment-requests">Payment requests</h3>
          <p className="small-note">
            One-time charges. Copy the private link and send it to the payer; no
            email is sent.
          </p>
        </div>
        {!formOpen && (
          <Button onPress={() => setFormOpen(true)} variant="primary">
            New payment request
          </Button>
        )}
      </div>
      {formOpen ? (
        <InvoiceForm
          busy={busy}
          onClose={() => setFormOpen(false)}
          properties={properties}
          save={save}
        />
      ) : null}
      {invoices.length ? (
        <ul className="payment-rows">
          {invoices.map((i) => (
            <PaymentRow
              actions={requestActions(i, {
                cancel: () => save({ action: "voidInvoice", id: i.id }),
                remove: () => setRemoving(i.id),
              })}
              amount={dollars(i.amountCents)}
              key={i.id}
              meta={`${categoryLabels[i.category ?? ""] ?? "Charge"} · Due ${i.dueDate} · ${i.payerName} · ${propertyName(i.propertyId) ?? "Removed property"}`}
              primary={
                i.status === "open" ? <CopyLinkButton url={i.url} /> : undefined
              }
              status={invoiceStatus(i.status)}
              test={i.mode === "test"}
              title={i.description}
            >
              <RenterSharing
                kind="invoice"
                propertyId={i.propertyId}
                recordId={i.id}
              />
            </PaymentRow>
          ))}
        </ul>
      ) : (
        <p className="tenant-empty-state">No payment requests yet.</p>
      )}
      {!!target && (
        <RemoveButton
          cancelFirst={target.status === "open"}
          disabled={busy}
          id={target.id}
          kind="invoice"
          name={target.description}
          onOpenChange={(open) => {
            if (!open) {
              setRemoving(null);
            }
          }}
          onRemoved={onSaved}
          open
        />
      )}
    </section>
  );
}

function requestActions(
  i: InvoiceRecord,
  run: { cancel: () => void; remove: () => void }
): OverflowAction[] {
  return [
    { href: i.url, label: "Open payment page" },
    {
      href: `/admin/payment-history?invoice=${i.id}`,
      label: "View payment activity",
    },
    ...(i.status === "open"
      ? [
          {
            label: "Cancel request",
            onAction: () => {
              if (
                // biome-ignore lint/suspicious/noAlert: Canceling a request cannot be undone.
                window.confirm(
                  "Cancel this payment request? The payer can no longer pay it. This cannot be undone."
                )
              ) {
                run.cancel();
              }
            },
          },
        ]
      : []),
    { label: "Remove", onAction: run.remove, tone: "danger" as const },
  ];
}

function InvoiceForm({
  properties,
  save,
  busy,
  onClose,
}: {
  properties: PropertyRecord[];
  save: Save;
  busy: boolean;
  onClose: () => void;
}) {
  const [id, setId] = useState(() => crypto.randomUUID());

  return (
    <form
      className="management-form payment-form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        const ok = await save({
          action: "invoice",
          data: {
            amountCents: Math.round(Number(f.get("amount")) * 100),
            category: f.get("category"),
            description: f.get("description"),
            dueDate: f.get("dueDate"),
            payerEmail: f.get("payerEmail"),
            payerName: f.get("payerName"),
            propertyId: f.get("propertyId"),
          },
          id,
        });
        if (ok) {
          setId(crypto.randomUUID());
          form.reset();
          onClose();
        }
      }}
    >
      <fieldset disabled={busy}>
        <div className="fields">
          <PropertySelect properties={properties} />
          <Field label="Payer name" name="payerName" />
          <Field label="Payer email" name="payerEmail" type="email" />
          <AppSelect label={<>Payment type</>} name="category">
            <option value="rent">Rent</option>
            <option value="deposit">Deposit</option>
            <option value="application_fee">Application fee</option>
            <option value="other">Other</option>
          </AppSelect>
          <Field label="Description / rent period" name="description" />
          <Field label="Amount ($)" name="amount" type="number" />
          <Field label="Due date" name="dueDate" type="date" />
        </div>
        <p className="small-note">
          Check the amount and payer. A request can’t be edited after it is
          created; cancel it and make a new one instead.
        </p>
        <div className="management-actions">
          <Button disabled={!properties.length} type="submit" variant="primary">
            Create payment request
          </Button>
          <Button onPress={onClose} variant="quiet">
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
