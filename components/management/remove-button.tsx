// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { type RemovalKind, removalLabels } from "@/lib/management/removal";
import { SectionCard } from "./section-card";
export async function removalCommand(body: unknown) {
  const response = await fetch("/api/admin/removed", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not update this item.");
  }
}
export function RemoveButton({
  kind,
  id,
  name,
  onRemoved,
  disabled,
  cancelFirst = false,
  open: controlledOpen,
  onOpenChange,
}: {
  kind: RemovalKind;
  id: string;
  name: string;
  onRemoved: () => unknown;
  disabled?: boolean;
  cancelFirst?: boolean;
  /** When set, the dialog is opened elsewhere (for example, from a menu) and no trigger renders. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [typed, setTyped] = useState("");
  // Removing a property unpublishes it and hides its leases and invitations,
  // so the owner must type its name before the remove button works.
  const requiresName = kind === "property";
  const nameMatches = typed.trim() === name.trim();
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : localOpen;
  const setOpen = (value: boolean) => {
    if (value) {
      setError("");
      setTyped("");
    }
    if (controlled) {
      onOpenChange?.(value);
    } else {
      setLocalOpen(value);
    }
  };
  const label = removalLabels[kind].toLowerCase();

  const resolveResult1 = () => {
    if (busy) {
      return "Removing…";
    }
    if (cancelFirst) {
      if (kind === "invoice") {
        return "Cancel request & remove";
      }
      return "Stop payments & remove";
    }
    return `Remove ${label}`;
  };
  return (
    <>
      {!controlled && (
        <Button
          aria-label={`Remove ${label}: ${name}`}
          className="remove-record-button"
          disabled={disabled}
          onClick={() => {
            setError("");
            setOpen(true);
          }}
          type="button"
        >
          Remove
        </Button>
      )}
      <ModalOverlay
        className="remove-overlay"
        isDismissable={!busy}
        isOpen={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
          }
        }}
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
              {!!(kind === "property") && (
                <>
                  <p>
                    The listing will be unpublished, applications closed, and
                    resident links revoked. Related records stay in their own
                    sections. Remove external listings in Zillow, Avail, and
                    Apartments.com separately. Stop active rent schedules before
                    removing this property.
                  </p>
                  <p>
                    <strong>
                      Its leases cannot be sent for signature and tenant
                      invitations stop working
                    </strong>{" "}
                    until you restore it from Removed items.
                  </p>
                </>
              )}
              {!!(kind === "residentLink") && (
                <p>
                  The private link will stop working. Restoring it keeps it
                  revoked; create a new link to give access again.
                </p>
              )}
              {!!(kind === "leaseDraft") && (
                <p>
                  All saved versions of this lease will be removed together.
                </p>
              )}
              {!!(kind === "leaseTemplate") && (
                <p>
                  Existing lease drafts keep their original text. Restore this
                  document before using it for another draft.
                </p>
              )}
              {!!(kind === "notice") && (
                <p>
                  All versions leave the notice list. Emails already sent cannot
                  be recalled; delivery history is retained.
                </p>
              )}
              {!!(kind === "invoice") && (
                <p>
                  {cancelFirst
                    ? "The open payment request will be canceled before removal. "
                    : ""}
                  This does not refund a payment. Submitted payments must finish
                  processing first.
                </p>
              )}
              {!!(kind === "rentSchedule") && (
                <p>
                  {cancelFirst
                    ? "Future rent payments will be stopped before removal. "
                    : ""}
                  Submitted debits and invoices already issued are not reversed.
                </p>
              )}
            </div>
            {!!error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {requiresName ? (
              <label className="field remove-confirm-name">
                <span>
                  Type <strong>{name}</strong> to confirm
                </span>
                <input
                  autoComplete="off"
                  disabled={busy}
                  onChange={(event) => setTyped(event.target.value)}
                  spellCheck={false}
                  value={typed}
                />
              </label>
            ) : null}
            <div className="management-actions">
              <Button
                autoFocus
                isDisabled={busy}
                onPress={() => setOpen(false)}
              >
                Keep {label}
              </Button>
              <Button
                className="remove-confirm-button"
                isDisabled={busy || (requiresName && !nameMatches)}
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
                          body: JSON.stringify({
                            action:
                              kind === "invoice" ? "voidInvoice" : "cancel",
                            id,
                          }),
                          headers: { "Content-Type": "application/json" },
                          method: "POST",
                        }
                      );
                      const result = await response.json();
                      if (!response.ok) {
                        throw new Error(result.error);
                      }
                    }
                    await removalCommand({ action: "remove", id, kind });
                    await onRemoved();
                    setOpen(false);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not remove this item."
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {resolveResult1()}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
export interface RemovedRecord {
  entityId: string;
  groupId: string;
  kind: RemovalKind;
  label: string;
  removedAt: string;
}
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
    <SectionCard labelledBy="removed-heading">
      <h2 id="removed-heading">Removed items</h2>
      <p>
        Restore items to their original section. Properties stay unpublished,
        resident links stay revoked, and canceled payments stay canceled.
      </p>
      {!!error && <p role="alert">{error}</p>}
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
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await removalCommand({ action: "restore", id: r.entityId });
                  await onSaved();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not restore."
                  );
                } finally {
                  setBusy(false);
                }
              }}
              type="submit"
            >
              Restore {removalLabels[r.kind].toLowerCase()}
            </Button>
          </article>
        ))}
    </SectionCard>
  );
}
