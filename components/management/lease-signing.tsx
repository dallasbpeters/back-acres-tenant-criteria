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
import { CopySigningLink } from "./copy-signing-link";
import { TenantContactExtras } from "./tenant-contact-extras";

const LeasePdfPreview = dynamic(
  () => import("./lease-pdf-preview").then((m) => m.LeasePdfPreview),
  { loading: () => <p role="status">Loading PDF viewer…</p>, ssr: false }
);
interface Signer {
  declinedAt?: string | null;
  /** Empty or null for a tenant reached by phone. */
  email: string | null;
  id?: string;
  invitedAt?: string | null;
  name: string;
  phone?: string | null;
  role: "tenant" | "landlord";
  signedAt?: string | null;
}
interface Renter {
  email: string;
  name: string;
  source: "account" | "invited";
}
/** The renter picker's value: the signer's email when it is a listed renter. */
function pickedRenter(renters: Renter[], email: string | null) {
  const normalized = (email ?? "").trim().toLowerCase();
  return renters.some((r) => r.email === normalized) ? normalized : "";
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: Load once per lease so the row can show its signing status; later refreshes are explicit.
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [draftId]);
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
  async function createPacket() {
    await post({
      action: "create",
      data: {
        draftId,
        reviewed,
        signers: signers.map(({ name, email, phone, role }) => ({
          email: email ?? "",
          name,
          phone: phone ?? "",
          role,
        })),
      },
    });
    const records = await load();
    return records.find((p) => p.status !== "voided");
  }
  async function emailSigners(people: Signer[]) {
    const failed: string[] = [];
    let accepted = 0;
    for (const [index, signer] of people.entries()) {
      setMessage(`Sending ${index + 1} of ${people.length}: ${signer.email}…`);
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
  }
  async function send(recipients?: Signer[]) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let people = recipients;
      if (!people) {
        const created = await createPacket();
        people = created?.signers ?? [];
        // The landlord signs first. Tenants get their emails right after.
        if (created && people.some((p) => p.role === "landlord")) {
          setMessage("Opening the lease for your signature…");
          await signAsLandlord(created.id);
          return;
        }
      }
      await emailSigners(people);
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
  async function signAsLandlord(packetId: string) {
    const result = await post({ action: "signAsOwner", packetId });
    window.location.assign((result as { url: string }).url);
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
  /** Cancels the open request and reopens the form with its signers to edit. */
  async function changeSigners(packet: Packet) {
    if (
      !(
        /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
          "Change signers? This cancels the current signing request. You then fix the signers and send the lease again; everyone signs the new request."
        )
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post({ action: "void", packetId: packet.id });
      setSigners(
        packet.signers.map((signer) => ({
          email: signer.email,
          id: crypto.randomUUID(),
          name: signer.name,
          phone: signer.phone,
          role: signer.role,
        }))
      );
      setReviewed(false);
      await load();
      setOpen(true);
      setMessage(
        "Signing request canceled. Edit the signers below and send the lease again."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rowPacket = packets.find((p) => p.status !== "voided");
  const rowStatus = (() => {
    if (!rowPacket) {
      return { label: "Not sent", tone: "draft" };
    }
    if (rowPacket.status === "completed") {
      return { label: "Signed", tone: "done" };
    }
    const done = rowPacket.signers.filter((x) => x.signedAt).length;
    const late = new Date(rowPacket.expiresAt).getTime() < Date.now();
    return {
      label: late
        ? "Signing request expired"
        : `Out for signature · ${done} of ${rowPacket.signers.length} signed`,
      tone: late ? "late" : "out",
    };
  })();
  const active = packets.find((p) => p.status !== "voided"),
    expired = !!active && new Date(active.expiresAt).getTime() < Date.now(),
    unsent =
      active?.signers.filter(
        (s) => s.email && !(s.signedAt || s.declinedAt || s.invitedAt)
      ) ?? [],
    signed = active?.signers.filter((s) => s.signedAt).length ?? 0;

  const resolveResult1 =
    /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
    () => {
      if (loaded) {
        if (active) {
          return (
            <>
              {active.status === "awaiting" && (
                <div className="management-actions signing-request-actions">
                  <Button
                    disabled={busy}
                    onClick={() => changeSigners(active)}
                    type="button"
                  >
                    Change signers
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => cancel(active.id)}
                    type="button"
                    variant="danger"
                  >
                    Cancel signing request
                  </Button>
                </div>
              )}
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
                        {s.email || s.phone} · {s.role}
                      </p>
                      <p className="signing-recipient-state">
                        {resolveResult2()}
                      </p>
                    </div>
                    {!!(
                      !(s.signedAt || s.declinedAt) &&
                      active.status === "awaiting" &&
                      !expired
                    ) &&
                      (s.role === "landlord" ? (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            signAsLandlord(active.id).catch((e) => {
                              setError((e as Error).message);
                              setBusy(false);
                            });
                          }}
                          type="button"
                          variant="primary"
                        >
                          Sign as landlord
                        </Button>
                      ) : (
                        <div className="signer-actions">
                          {!!s.email && (
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
                          <CopySigningLink
                            disabled={busy}
                            name={s.name}
                            phone={s.phone ?? null}
                            signerId={s.id ?? ""}
                          />
                        </div>
                      ))}
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
              Add each adult tenant and the landlord. You sign first as
              landlord. Then each tenant gets a private link to review the PDF
              and sign: by email, or by a text you send from Messages if you
              only have their mobile number. Links are valid for 30 days.
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
                      value={pickedRenter(renters, s.email)}
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
                      required={s.role === "landlord" || !s.phone}
                      type="email"
                      value={s.email ?? ""}
                    />
                  </label>
                  {s.role === "tenant" && (
                    <TenantContactExtras
                      account={accounts[(s.email ?? "").trim().toLowerCase()]}
                      onPhone={(phone) =>
                        setSigners((v) =>
                          v.map((x, j) => (j === i ? { ...x, phone } : x))
                        )
                      }
                      phone={s.phone ?? ""}
                    />
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
                {signers.some((s) => s.role === "landlord")
                  ? "Next you sign as landlord. Right after, each tenant is emailed a lease you already signed. "
                  : ""}
                Sending locks this saved version and its branding. Later edits
                will need a new signing request.
              </p>
              <Button
                disabled={busy || !reviewed}
                type="submit"
                variant="primary"
              >
                {(() => {
                  if (busy) {
                    return "Preparing lease…";
                  }
                  return signers.some((s) => s.role === "landlord")
                    ? "Sign as landlord and send"
                    : "Send lease for signature";
                })()}
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
          {!!loaded && (
            <span className={`lease-status lease-status--${rowStatus.tone}`}>
              {rowStatus.label}
            </span>
          )}
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
            {(() => {
              if (active?.status === "completed") {
                return "View signing details";
              }
              return active ? "Signing status" : "Send lease";
            })()}
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
