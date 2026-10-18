"use client";
import { Button } from "@/components/ui/button";

import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { removalLabels, type RemovalKind } from "@/lib/management/removal";
export async function removalCommand(body: unknown) {
  const response = await fetch("/api/admin/removed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Could not update this item.");
}
export function RemoveButton({
  kind,
  id,
  name,
  onRemoved,
  disabled,
  cancelFirst = false,
}: {
  kind: RemovalKind;
  id: string;
  name: string;
  onRemoved: () => Promise<unknown> | void;
  disabled?: boolean;
  cancelFirst?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const label = removalLabels[kind].toLowerCase();
  return (
    <>
      <Button
        type="button"
        className="remove-record-button"
        disabled={disabled}
        aria-label={`Remove ${label}: ${name}`}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Remove
      </Button>
      <ModalOverlay
        className="remove-overlay"
        isOpen={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
        isDismissable={!busy}
      >
        <Modal className="remove-modal">
          <Dialog aria-describedby={`remove-description-${id}`}>
            <Heading slot="title">Remove {label}?</Heading>
            <p className="remove-item-name">{name}</p>
            <div id={`remove-description-${id}`}>
              <p>
                This item will leave the workspace. You can restore it from
                Removed items; its history is retained.
              </p>
              {kind === "property" && (
                <p>
                  The listing will be unpublished, applications closed, and
                  resident links revoked. Related records stay in their own
                  sections. Remove external listings in Zillow, Avail, and
                  Apartments.com separately. Stop active rent schedules before
                  removing this property.
                </p>
              )}
              {kind === "residentLink" && (
                <p>
                  The private link will stop working. Restoring it keeps it
                  revoked; create a new link to give access again.
                </p>
              )}
              {kind === "leaseDraft" && (
                <p>
                  All saved versions of this lease will be removed together.
                </p>
              )}
              {kind === "leaseTemplate" && (
                <p>
                  Existing lease drafts keep their original text. Restore this
                  document before using it for another draft.
                </p>
              )}
              {kind === "notice" && (
                <p>
                  All versions leave the notice list. Emails already sent cannot
                  be recalled; delivery history is retained.
                </p>
              )}
              {kind === "invoice" && (
                <p>
                  {cancelFirst
                    ? "The open payment request will be canceled before removal. "
                    : ""}
                  This does not refund a payment. Submitted payments must finish
                  processing first.
                </p>
              )}
              {kind === "rentSchedule" && (
                <p>
                  {cancelFirst
                    ? "Future rent payments will be stopped before removal. "
                    : ""}
                  Submitted debits and invoices already issued are not reversed.
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="management-actions">
              <Button isDisabled={busy} onPress={() => setOpen(false)}>
                Keep {label}
              </Button>
              <Button
                className="remove-confirm-button"
                isDisabled={busy}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    if (
                      cancelFirst &&
                      (kind === "invoice" || kind === "rentSchedule")
                    ) {
                      const response = await fetch(
                        kind === "invoice"
                          ? "/api/admin/management"
                          : "/api/admin/billing",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action:
                              kind === "invoice" ? "voidInvoice" : "cancel",
                            id,
                          }),
                        },
                      );
                      const result = await response.json();
                      if (!response.ok) throw Error(result.error);
                    }
                    await removalCommand({ action: "remove", kind, id });
                    await onRemoved();
                    setOpen(false);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not remove this item.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Removing…"
                  : cancelFirst
                    ? kind === "invoice"
                      ? "Cancel request & remove"
                      : "Stop payments & remove"
                    : `Remove ${label}`}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
export type RemovedRecord = {
  entityId: string;
  groupId: string;
  kind: RemovalKind;
  label: string;
  removedAt: string;
};
export function RemovedWorkspace({
  records,
  onSaved,
}: {
  records: RemovedRecord[];
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section aria-label="Removed items">
      <h2>Removed items</h2>
      <p>
        Restore items to their original section. Properties stay unpublished,
        resident links stay revoked, and canceled payments stay canceled.
      </p>
      {error && <p role="alert">{error}</p>}
      {!records.length && <p className="management-empty">No removed items.</p>}
      {[...records]
        .sort((a, b) => b.removedAt.localeCompare(a.removedAt))
        .map((r) => (
          <article className="record removed-item" key={r.groupId}>
            <div>
              <h3>{r.label}</h3>
              <p>
                {removalLabels[r.kind]} · Removed{" "}
                {new Date(r.removedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              type="submit"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await removalCommand({ action: "restore", id: r.entityId });
                  await onSaved();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not restore.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restore {removalLabels[r.kind].toLowerCase()}
            </Button>
          </article>
        ))}
    </section>
  );
}
