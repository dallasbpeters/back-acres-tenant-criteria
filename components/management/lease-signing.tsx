// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import dynamic from "next/dynamic";
import posthog from "posthog-js";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type OverflowAction,
  OverflowMenu,
} from "@/components/ui/overflow-menu";
import { AppSelect } from "@/components/ui/select";

const LeasePdfPreview = dynamic(
  () => import("./lease-pdf-preview").then((m) => m.LeasePdfPreview),
  { loading: () => <p role="status">Loading PDF viewer…</p>, ssr: false }
);
interface Signer {
  declinedAt?: string | null;
  email: string;
  id?: string;
  invitedAt?: string | null;
  name: string;
  role: "tenant" | "landlord";
  signedAt?: string | null;
}
interface Renter {
  email: string;
  name: string;
  source: "account" | "invited";
}
interface Packet {
  createdAt: string;
  documentHash: string;
  expiresAt: string;
  finalHash: string | null;
  id: string;
  signers: Signer[];
  status: string;
}
export function LeaseSigning({
  draftId,
  tenantName,
  landlordName,
  landlordEmail = "",
  tenantEmail = "",
  embedded = false,
  heading,
  leading,
  menuActions = [],
}: {
  draftId: string;
  tenantName: string;
  landlordName: string;
  landlordEmail?: string;
  tenantEmail?: string;
  /** Render only the signing panel, always open (the lease editor's side panel). */
  embedded?: boolean;
  /** Record details shown at the start of the action row. */
  heading?: ReactNode;
  /** Actions placed before Preview PDF and Send lease (for example, Open lease). */
  leading?: ReactNode;
  /** Less frequent actions added to the "⋯" menu after Download PDF. */
  menuActions?: OverflowAction[];
}) {
  const panelId = useId();
  const [open, setOpen] = useState(embedded),
    [preview, setPreview] = useState(false),
    [loaded, setLoaded] = useState(false),
    [packets, setPackets] = useState<Packet[]>([]),
    [renters, setRenters] = useState<Renter[]>([]),
    [accounts, setAccounts] = useState<Record<string, boolean>>({}),
    [signers, setSigners] = useState<Signer[]>([
      {
        email: tenantEmail,
        id: "initial-tenant",
        name: tenantName,
        role: "tenant",
      },
      {
        email: landlordEmail,
        id: "initial-landlord",
        name: landlordName,
        role: "landlord",
      },
    ]),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0);
  async function load() {
    const r = await fetch(`/api/admin/lease-signing?draftId=${draftId}`, {
        cache: "no-store",
      }),
      data = await r.json();
    if (!r.ok) {
      throw new Error(data.error ?? "Could not load signing records.");
    }
    setPackets(data.packets);
    setLoaded(true);
    setRevision((v) => v + 1);
    return data.packets as Packet[];
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: Load once per lease when the panel is embedded; later refreshes are explicit.
  useEffect(() => {
    if (embedded) {
      load().catch((e) => setError(e.message));
    }
  }, [embedded, draftId]);
  // Renters connected to this lease's property, for choosing signers.
  useEffect(() => {
    if (!open) {
      return;
    }
    fetch(`/api/admin/renters?draftId=${draftId}`)
      .then((r) => (r.ok ? r.json() : { renters: [] }))
      .then((data) => setRenters(data.renters ?? []))
      .catch(() => setRenters([]));
  }, [open, draftId]);
  // Whether a tenant portal account owns this email (the lease only shows
  // in a portal account that has the signer's email).
  const checkAccount = useCallback(
    async (email: string) => {
      const normalized = email.trim().toLowerCase();
      if (!normalized.includes("@") || normalized in accounts) {
        return;
      }
      try {
        const r = await fetch(
          `/api/admin/renters?email=${encodeURIComponent(normalized)}`
        );
        const data = await r.json();
        if (r.ok && data.valid) {
          setAccounts((v) => ({ ...v, [normalized]: !!data.hasAccount }));
        }
      } catch {
        // The check is advisory; sending still works without it.
      }
    },
    [accounts]
  );
  async function post(body: unknown) {
    const r = await fetch("/api/admin/lease-signing", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      data = await r.json();
    if (!r.ok) {
      throw new Error(data.error ?? "Could not update this signing request.");
    }
    return data;
  }
  async function send(recipients?: Signer[]) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let people = recipients;
      if (!people) {
        await post({
          action: "create",
          data: {
            draftId,
            reviewed,
            signers: signers.map(({ name, email, role }) => ({
              email,
              name,
              role,
            })),
          },
        });
        const records = await load();
        people = records.find((p) => p.status !== "voided")?.signers ?? [];
      }
      const failed: string[] = [];
      let accepted = 0;
      for (const [index, signer] of people.entries()) {
        setMessage(
          `Sending ${index + 1} of ${people.length}: ${signer.email}…`
        );
        try {
          /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await post(
            { action: "invite", signerId: signer.id }
          );
          accepted += 1;
        } catch (e) {
          failed.push(`${signer.email}: ${(e as Error).message}`);
        }
        if (index < people.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
      if (accepted) {
        posthog.capture("lease_signing_invitations_sent", {
          recipient_count: accepted,
        });
      }
      setMessage(
        `${accepted} signing email${accepted === 1 ? "" : "s"} accepted by the email provider. Each recipient receives their own private signing link.`
      );
      if (failed.length) {
        setError(
          `Some emails could not be sent. ${failed.join(" ")} Use Send unsent emails to retry the remaining recipients.`
        );
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
      // A created packet is retained if sending or a subsequent request fails.
      await load().catch(() => {
        /* Best-effort fallback: retain the original result when this optional operation fails. */
      });
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    if (
      !(
        /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
          "Cancel this signing request? Existing signatures remain in the audit record. A new request will require everyone to sign again."
        )
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post({ action: "void", packetId: id });
      await load();
      posthog.capture("lease_signing_request_cancelled");
      setReviewed(false);
      setMessage("Signing request canceled.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = packets.find((p) => p.status !== "voided"),
    expired = !!active && new Date(active.expiresAt).getTime() < Date.now(),
    unsent =
      active?.signers.filter(
        (s) => !(s.signedAt || s.declinedAt || s.invitedAt)
      ) ?? [],
    signed = active?.signers.filter((s) => s.signedAt).length ?? 0;

  const resolveResult1 =
    /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
    () => {
      if (loaded) {
        if (active) {
          return (
            <>
              <p className="signing-summary">
                {active.status === "completed"
                  ? "All required signatures recorded."
                  : `${signed} of ${active.signers.length} signed · ${expired ? "Request expired" : `Expires ${new Date(active.expiresAt).toLocaleDateString()}`}`}
              </p>
              {active.signers.map((s) => {
                const resolveResult2 = () => {
                  if (s.signedAt) {
                    return `Signed ${new Date(s.signedAt).toLocaleString()}`;
                  }
                  if (s.declinedAt) {
                    return "Declined electronic signing";
                  }
                  if (s.invitedAt) {
                    return `Email accepted ${new Date(s.invitedAt).toLocaleString()} · Awaiting signature`;
                  }
                  return "No email send recorded";
                };
                return (
                  <div className="signer-status" key={s.id}>
                    <div>
                      <strong>{s.name}</strong>
                      <p>
                        {s.email} · {s.role}
                      </p>
                      <p className="signing-recipient-state">
                        {resolveResult2()}
                      </p>
                    </div>
                    {!!(
                      !(s.signedAt || s.declinedAt) &&
                      active.status === "awaiting" &&
                      !expired
                    ) && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          send([s]);
                        }}
                        type="button"
                      >
                        {s.invitedAt
                          ? "Resend signing email"
                          : "Send signing email"}
                      </Button>
                    )}
                  </div>
                );
              })}
              <div className="management-actions">
                {!!(
                  active.status === "awaiting" &&
                  !expired &&
                  unsent.length > 0
                ) && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      send(unsent);
                    }}
                    type="button"
                    variant="primary"
                  >
                    Send unsent emails
                  </Button>
                )}
                <Button
                  disabled={busy}
                  onClick={() => {
                    load().catch((e) => setError(e.message));
                  }}
                  type="button"
                >
                  Refresh signature status
                </Button>
                {!!(active.status === "awaiting") && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      if (active) {
                        cancel(active.id);
                      }
                    }}
                    type="button"
                  >
                    Cancel signing request
                  </Button>
                )}
              </div>
              <details className="signing-audit-details">
                <summary>Document audit details</summary>
                <p className="document-fingerprint">
                  Original PDF SHA-256: {active.documentHash}
                </p>
                {!!active.finalHash && (
                  <p className="document-fingerprint">
                    Signed PDF SHA-256: {active.finalHash}
                  </p>
                )}
              </details>
            </>
          );
        }
        return (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <p className="signing-intro">
              Add each adult tenant and the landlord. We’ll email everyone a
              private link to review the PDF, verify their email, and sign.
              Links are valid for 30 days.
            </p>
            <fieldset className="signing-recipients" disabled={busy}>
              <legend className="visually-hidden">Lease recipients</legend>
              {signers.map((s, i) => (
                <fieldset className="signer-fields" key={s.id}>
                  <legend>
                    {s.role === "landlord" ? "Landlord" : "Tenant"} · Signer{" "}
                    {i + 1}
                  </legend>
                  {s.role === "tenant" && renters.length > 0 ? (
                    <AppSelect
                      label="Choose a connected renter"
                      onValueChange={(email) => {
                        const renter = renters.find((r) => r.email === email);
                        if (!renter) {
                          return;
                        }
                        setSigners((v) =>
                          v.map((x, j) =>
                            j === i
                              ? { ...x, email: renter.email, name: renter.name }
                              : x
                          )
                        );
                        checkAccount(renter.email);
                      }}
                      value={
                        renters.some(
                          (r) => r.email === s.email.trim().toLowerCase()
                        )
                          ? s.email.trim().toLowerCase()
                          : ""
                      }
                    >
                      <option value="">Type a signer below, or choose…</option>
                      {renters.map((renter) => (
                        <option key={renter.email} value={renter.email}>
                          {renter.name} · {renter.email} ·{" "}
                          {renter.source === "account"
                            ? "portal account"
                            : "invited"}
                        </option>
                      ))}
                    </AppSelect>
                  ) : null}
                  <label className="field">
                    Full legal name
                    <input
                      maxLength={150}
                      onChange={(e) =>
                        setSigners((v) =>
                          v.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x
                          )
                        )
                      }
                      required
                      value={s.name}
                    />
                  </label>
                  <label className="field">
                    Email address
                    <input
                      onBlur={(e) => {
                        if (s.role === "tenant") {
                          checkAccount(e.target.value);
                        }
                      }}
                      onChange={(e) =>
                        setSigners((v) =>
                          v.map((x, j) =>
                            j === i ? { ...x, email: e.target.value } : x
                          )
                        )
                      }
                      required
                      type="email"
                      value={s.email}
                    />
                  </label>
                  {s.role === "tenant" &&
                    accounts[s.email.trim().toLowerCase()] === false && (
                      <p className="signer-warning" role="status">
                        No tenant portal account uses this email. The lease
                        email will include a portal invitation for it. If this
                        renter already has a portal account with a different
                        email, use that email so the lease appears in their
                        portal.
                      </p>
                    )}
                  {s.role === "tenant" &&
                    accounts[s.email.trim().toLowerCase()] === true && (
                      <p className="small-note">
                        Matches a tenant portal account. The lease will appear
                        in that portal.
                      </p>
                    )}
                  <AppSelect
                    label="Signing as"
                    onValueChange={(value) =>
                      setSigners((v) =>
                        v.map((x, j) =>
                          j === i ? { ...x, role: value as Signer["role"] } : x
                        )
                      )
                    }
                    value={s.role}
                  >
                    <option value="tenant">Tenant</option>
                    <option value="landlord">Landlord</option>
                  </AppSelect>
                  {!!(signers.length > 2) && (
                    <Button
                      onClick={() =>
                        setSigners((v) => v.filter((_, j) => j !== i))
                      }
                      type="button"
                    >
                      Remove signer
                    </Button>
                  )}
                </fieldset>
              ))}
              <Button
                disabled={signers.length >= 12}
                onClick={() =>
                  setSigners((v) => [
                    ...v,
                    {
                      email: "",
                      id: crypto.randomUUID(),
                      name: "",
                      role: "tenant",
                    },
                  ])
                }
                type="button"
              >
                Add signer
              </Button>
              <label className="check-row">
                <input
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  required
                  type="checkbox"
                />
                I have reviewed this exact saved lease, all terms and required
                attachments, and the list of people who must sign.
              </label>
            </fieldset>
            <div className="signing-send-footer">
              <p>
                Sending locks this saved version and its branding. Later edits
                will need a new signing request.
              </p>
              <Button
                disabled={busy || !reviewed}
                type="submit"
                variant="primary"
              >
                {busy ? "Sending lease…" : "Send lease for signature"}
              </Button>
            </div>
          </form>
        );
      }
      return (
        <>
          <p>Loading signing records…</p>
          {!!error && (
            <Button
              onClick={() => {
                load().catch((e) => setError(e.message));
              }}
              type="button"
            >
              Try again
            </Button>
          )}
        </>
      );
    };
  const panel = (
    <section
      aria-busy={busy}
      aria-label={`Send lease to ${tenantName}`}
      className={
        embedded ? "signing-panel signing-panel--embedded" : "signing-panel"
      }
      id={panelId}
    >
      {!embedded && (
        <div className="signing-panel-heading">
          <p className="eyebrow">Lease delivery</p>
          <h4>
            {active?.status === "completed"
              ? "Signed lease"
              : "Send for signature"}
          </h4>
        </div>
      )}
      {!!error && <p role="alert">{error}</p>}
      {!!message && <p role="status">{message}</p>}
      {resolveResult1()}
      {!!packets.some((p) => p.status === "voided") && (
        <p className="small-note">
          {packets.filter((p) => p.status === "voided").length} canceled signing
          request(s) retained in the audit history.
        </p>
      )}
    </section>
  );
  if (embedded) {
    return panel;
  }
  return (
    <div className="lease-signing-admin">
      <div className="lease-row">
        {heading}
        <div className="lease-row-actions">
          {leading}
          <Button
            aria-expanded={preview}
            disabled={busy}
            onClick={() => setPreview((v) => !v)}
            type="button"
            variant="quiet"
          >
            {preview ? "Hide PDF preview" : "Preview PDF"}
          </Button>
          <Button
            aria-controls={panelId}
            aria-expanded={open}
            disabled={busy}
            onClick={() => {
              setOpen((v) => !v);
              if (!open) {
                setLoaded(false);
                setError("");
                load().catch((e) => setError(e.message));
              }
            }}
            type="button"
            variant="primary"
          >
            {active?.status === "completed"
              ? "View signing details"
              : "Send lease"}
          </Button>
          <OverflowMenu
            actions={[
              {
                href: `/api/admin/leases/${draftId}/pdf?preview=1`,
                label: "Download PDF",
              },
              ...menuActions,
            ]}
            disabled={busy}
            label={`More actions for ${tenantName}`}
          />
        </div>
      </div>
      {!!preview && (
        <LeasePdfPreview
          draftId={draftId}
          onClose={() => setPreview(false)}
          revision={revision}
        />
      )}
      {!!open && panel}
    </div>
  );
}
