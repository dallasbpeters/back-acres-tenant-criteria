"use client";
import { Button } from "@/components/ui/button";

import { useState } from "react";
import { AppSelect } from "@/components/ui/select";
type Signer = {
  id?: string;
  name: string;
  email: string;
  role: "tenant" | "landlord";
  signedAt?: string | null;
  declinedAt?: string | null;
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
  const [open, setOpen] = useState(false),
    [packets, setPackets] = useState<Packet[]>([]),
    [signers, setSigners] = useState<Signer[]>([
      { name: tenantName, email: tenantEmail, role: "tenant" },
      { name: landlordName, email: landlordEmail, role: "landlord" },
    ]),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch(`/api/admin/lease-signing?draftId=${draftId}`),
      data = await r.json();
    if (!r.ok) throw Error(data.error);
    setPackets(data.packets);
  }
  async function change(body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/lease-signing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      await load();
      setMessage(
        (body as { action: string }).action === "invite"
          ? "Signing link accepted by email provider."
          : "Signing records updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = packets.find((p) => p.status !== "voided");
  return (
    <div className="lease-signing-admin">
      <Button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) load().catch((e) => setError(e.message));
        }}
        aria-expanded={open}
      >
        Signatures
      </Button>
      {open && (
        <section
          className="signing-panel"
          aria-label={`Signatures for ${tenantName}`}
        >
          <h4>Lease signatures</h4>
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          {!active ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void change({
                  action: "create",
                  data: {
                    draftId,
                    reviewed,
                    signers: signers.map(({ id, signedAt, ...s }) => s),
                  },
                });
              }}
            >
              <p>
                Add every adult tenant and the landlord. Each person signs
                separately after verifying their email. This freezes this lease
                version and its branding for 30 days.
              </p>
              {signers.map((s, i) => (
                <fieldset className="signer-fields" key={i}>
                  <legend>Signer {i + 1}</legend>
                  <label className="field">
                    Full legal name
                    <input
                      required
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
                          j === i ? { ...x, role: value as Signer["role"] } : x,
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
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !reviewed}
              >
                Create signing packet
              </Button>
            </form>
          ) : (
            <>
              <p>
                {active.status === "completed"
                  ? "All required signatures recorded."
                  : `Awaiting signatures · Link expires ${new Date(active.expiresAt).toLocaleDateString()}`}
              </p>
              {active.signers.map((s) => (
                <div className="signer-status" key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <p>
                      {s.email} · {s.role}
                    </p>
                    <p>
                      {s.signedAt
                        ? `Signed ${new Date(s.signedAt).toLocaleString()}`
                        : s.declinedAt
                          ? "Declined electronic signing"
                          : "Not yet signed"}
                    </p>
                  </div>
                  {!s.signedAt &&
                    !s.declinedAt &&
                    active.status === "awaiting" && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void change({ action: "invite", signerId: s.id })
                        }
                      >
                        Email signing link
                      </Button>
                    )}
                </div>
              ))}
              <p className="document-fingerprint">
                Original PDF SHA-256: {active.documentHash}
              </p>
              {active.status === "completed" && (
                <>
                  <a
                    href={`/api/admin/leases/${draftId}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download signed lease & audit record
                  </a>
                  <p className="document-fingerprint">
                    Signed PDF SHA-256: {active.finalHash}
                  </p>
                </>
              )}
              {active.status === "awaiting" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this signing request? Existing signatures remain in the audit record. A new packet will require everyone to sign again.",
                      )
                    )
                      void change({ action: "void", packetId: active.id });
                  }}
                >
                  Cancel signing request
                </Button>
              )}
              <Button
                type="button"
                disabled={busy}
                onClick={() => load().catch((e) => setError(e.message))}
              >
                Refresh signature status
              </Button>
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
