"use client";
import { Button } from "@/components/ui/button";
import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { AppSelect } from "@/components/ui/select";
const LeasePdfPreview = dynamic(
  () => import("./lease-pdf-preview").then((m) => m.LeasePdfPreview),
  { ssr: false, loading: () => <p role="status">Loading PDF viewer…</p> },
);
type Signer = {
  id?: string;
  name: string;
  email: string;
  role: "tenant" | "landlord";
  signedAt?: string | null;
  declinedAt?: string | null;
  invitedAt?: string | null;
};
type Packet = {
  id: string;
  status: string;
  documentHash: string;
  finalHash: string | null;
  createdAt: string;
  expiresAt: string;
  signers: Signer[];
};
export function LeaseSigning({
  draftId,
  tenantName,
  landlordName,
  landlordEmail = "",
  tenantEmail = "",
}: {
  draftId: string;
  tenantName: string;
  landlordName: string;
  landlordEmail?: string;
  tenantEmail?: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState(false),
    [loaded, setLoaded] = useState(false),
    [packets, setPackets] = useState<Packet[]>([]),
    [signers, setSigners] = useState<Signer[]>([
      { name: tenantName, email: tenantEmail, role: "tenant" },
      { name: landlordName, email: landlordEmail, role: "landlord" },
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
    if (!r.ok) throw Error(data.error ?? "Could not load signing records.");
    setPackets(data.packets);
    setLoaded(true);
    setRevision((v) => v + 1);
    return data.packets as Packet[];
  }
  async function post(body: unknown) {
    const r = await fetch("/api/admin/lease-signing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      data = await r.json();
    if (!r.ok)
      throw Error(data.error ?? "Could not update this signing request.");
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
              name,
              email,
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
          `Sending ${index + 1} of ${people.length}: ${signer.email}…`,
        );
        try {
          await post({ action: "invite", signerId: signer.id });
          accepted++;
        } catch (e) {
          failed.push(`${signer.email}: ${(e as Error).message}`);
        }
        if (index < people.length - 1)
          await new Promise((resolve) => setTimeout(resolve, 600));
      }
      setMessage(
        `${accepted} signing email${accepted === 1 ? "" : "s"} accepted by the email provider. Each recipient receives their own private signing link.`,
      );
      if (failed.length)
        setError(
          `Some emails could not be sent. ${failed.join(" ")} Use Send unsent emails to retry the remaining recipients.`,
        );
      await load();
    } catch (e) {
      setError((e as Error).message);
      // A created packet is retained if sending or a subsequent request fails.
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    if (
      !window.confirm(
        "Cancel this signing request? Existing signatures remain in the audit record. A new request will require everyone to sign again.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await post({ action: "void", packetId: id });
      await load();
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
        (s) => !s.signedAt && !s.declinedAt && !s.invitedAt,
      ) ?? [],
    signed = active?.signers.filter((s) => s.signedAt).length ?? 0;
  return (
    <div className="lease-signing-admin">
      <div className="management-actions lease-delivery-actions">
        <Button
          type="button"
          variant="primary"
          aria-expanded={open}
          aria-controls={panelId}
          disabled={busy}
          onClick={() => {
            setOpen((v) => !v);
            if (!open) {
              setLoaded(false);
              setError("");
              void load().catch((e) => setError(e.message));
            }
          }}
        >
          {active?.status === "completed"
            ? "View signing details"
            : "Send lease"}
        </Button>
        <Button
          type="button"
          aria-expanded={preview}
          disabled={busy}
          onClick={() => setPreview((v) => !v)}
        >
          {preview ? "Hide PDF preview" : "Preview PDF"}
        </Button>
        <a href={`/api/admin/leases/${draftId}/pdf?preview=1`}>Download PDF</a>
      </div>
      {preview && (
        <LeasePdfPreview
          draftId={draftId}
          revision={revision}
          onClose={() => setPreview(false)}
        />
      )}
      {open && (
        <section
          id={panelId}
          className="signing-panel"
          aria-label={`Send lease to ${tenantName}`}
          aria-busy={busy}
        >
          <div className="signing-panel-heading">
            <p className="eyebrow">Lease delivery</p>
            <h4>
              {active?.status === "completed"
                ? "Signed lease"
                : "Send for signature"}
            </h4>
          </div>
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          {!loaded ? (
            <>
              <p>Loading signing records…</p>
              {error && (
                <Button
                  type="button"
                  onClick={() => void load().catch((e) => setError(e.message))}
                >
                  Try again
                </Button>
              )}
            </>
          ) : !active ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <p className="signing-intro">
                Add each adult tenant and the landlord. We’ll email everyone a
                private link to review the PDF, verify their email, and sign.
                Links are valid for 30 days.
              </p>
              <fieldset disabled={busy} className="signing-recipients">
                <legend className="visually-hidden">Lease recipients</legend>
                {signers.map((s, i) => (
                  <fieldset className="signer-fields" key={i}>
                    <legend>
                      {s.role === "landlord" ? "Landlord" : "Tenant"} · Signer{" "}
                      {i + 1}
                    </legend>
                    <label className="field">
                      Full legal name
                      <input
                        required
                        maxLength={150}
                        value={s.name}
                        onChange={(e) =>
                          setSigners((v) =>
                            v.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      Email address
                      <input
                        type="email"
                        required
                        value={s.email}
                        onChange={(e) =>
                          setSigners((v) =>
                            v.map((x, j) =>
                              j === i ? { ...x, email: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <AppSelect
                      label="Signing as"
                      value={s.role}
                      onValueChange={(value) =>
                        setSigners((v) =>
                          v.map((x, j) =>
                            j === i
                              ? { ...x, role: value as Signer["role"] }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="tenant">Tenant</option>
                      <option value="landlord">Landlord</option>
                    </AppSelect>
                    {signers.length > 2 && (
                      <Button
                        type="button"
                        onClick={() =>
                          setSigners((v) => v.filter((_, j) => j !== i))
                        }
                      >
                        Remove signer
                      </Button>
                    )}
                  </fieldset>
                ))}
                <Button
                  type="button"
                  disabled={signers.length >= 12}
                  onClick={() =>
                    setSigners((v) => [
                      ...v,
                      { name: "", email: "", role: "tenant" },
                    ])
                  }
                >
                  Add signer
                </Button>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    required
                    onChange={(e) => setReviewed(e.target.checked)}
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
                  type="submit"
                  variant="primary"
                  disabled={busy || !reviewed}
                >
                  {busy ? "Sending lease…" : "Send lease for signature"}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="signing-summary">
                {active.status === "completed"
                  ? "All required signatures recorded."
                  : `${signed} of ${active.signers.length} signed · ${expired ? "Request expired" : `Expires ${new Date(active.expiresAt).toLocaleDateString()}`}`}
              </p>
              {active.signers.map((s) => (
                <div className="signer-status" key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <p>
                      {s.email} · {s.role}
                    </p>
                    <p className="signing-recipient-state">
                      {s.signedAt
                        ? `Signed ${new Date(s.signedAt).toLocaleString()}`
                        : s.declinedAt
                          ? "Declined electronic signing"
                          : s.invitedAt
                            ? `Email accepted ${new Date(s.invitedAt).toLocaleString()} · Awaiting signature`
                            : "No email send recorded"}
                    </p>
                  </div>
                  {!s.signedAt &&
                    !s.declinedAt &&
                    active.status === "awaiting" &&
                    !expired && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => void send([s])}
                      >
                        {s.invitedAt
                          ? "Resend signing email"
                          : "Send signing email"}
                      </Button>
                    )}
                </div>
              ))}
              <div className="management-actions">
                {active.status === "awaiting" &&
                  !expired &&
                  unsent.length > 0 && (
                    <Button
                      type="button"
                      variant="primary"
                      disabled={busy}
                      onClick={() => void send(unsent)}
                    >
                      Send unsent emails
                    </Button>
                  )}
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void load().catch((e) => setError(e.message))}
                >
                  Refresh signature status
                </Button>
                {active.status === "awaiting" && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancel(active.id)}
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
                {active.finalHash && (
                  <p className="document-fingerprint">
                    Signed PDF SHA-256: {active.finalHash}
                  </p>
                )}
              </details>
            </>
          )}
          {packets.some((p) => p.status === "voided") && (
            <p className="small-note">
              {packets.filter((p) => p.status === "voided").length} canceled
              signing request(s) retained in the audit history.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
