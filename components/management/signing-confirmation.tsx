"use client";
import { Button } from "@/components/ui/button";
import type { SignerRecord } from "./lease-signer";
import { PortalAccountStep } from "./portal-account-step";

const roleNames: Record<string, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
};
const when = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });

/** What a signer sees right after signing: proof, progress, and next step. */
export function SigningConfirmation({
  busy,
  contact,
  onClaim,
  onDownload,
  record,
}: {
  busy: boolean;
  contact: string;
  onClaim: () => Promise<string>;
  onDownload: () => void;
  record: SignerRecord & { signedAt: string };
}) {
  const completed = record.status === "completed";
  const signers = record.signers ?? [];
  const waiting = signers.filter((s) => !s.signedAt).map((s) => s.name);
  const next = completed
    ? "Everyone has signed. Your signed copy is ready."
    : `Next: ${waiting.join(" and ")} ${waiting.length === 1 ? "signs" : "sign"}.${record.role === "landlord" ? " We emailed each of them a private signing link." : ""} We will email you the signed lease when everyone has signed.`;
  return (
    <div className="signing-confirmation">
      <div className="signing-confirmation-head" role="status">
        <p className="eyebrow">Signature recorded</p>
        <h2>
          {completed ? "Your lease is fully signed" : "You signed the lease"}
        </h2>
        <p>
          Signed {when(record.signedAt)} (Central).
          {record.email
            ? ` A confirmation was emailed to ${record.email}.`
            : ""}
        </p>
      </div>
      <ol className="signing-progress">
        {signers.map((s) => (
          <li
            data-signed={s.signedAt ? "true" : "false"}
            key={`${s.role}-${s.name}`}
          >
            <span className="signing-progress-name">
              {s.name}
              <span className="small-note">
                {" "}
                · {roleNames[s.role] ?? s.role}
              </span>
            </span>
            <span className="signing-progress-state">
              {s.signedAt ? `Signed ${when(s.signedAt)}` : "Waiting to sign"}
            </span>
          </li>
        ))}
      </ol>
      <p>{next}</p>
      <div className="management-actions">
        <Button disabled={busy} onPress={onDownload} variant="primary">
          {completed
            ? "Download signed lease (PDF)"
            : "Download a copy with your signature (PDF)"}
        </Button>
      </div>
      {record.role === "tenant" && <PortalAccountStep onClaim={onClaim} />}
      <details className="signing-audit-details">
        <summary>Document audit details</summary>
        <p className="document-fingerprint">
          Original PDF SHA-256: {record.documentHash}
        </p>
        {!!record.finalHash && (
          <p className="document-fingerprint">
            Signed PDF SHA-256: {record.finalHash}
          </p>
        )}
      </details>
      <p className="small-note">Lease contact: {contact}</p>
    </div>
  );
}
