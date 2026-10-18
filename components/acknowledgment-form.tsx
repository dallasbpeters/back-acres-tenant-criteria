// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

interface Receipt {
  recordId: string;
  timestamp: string;
  version: string;
}
export function AcknowledgmentForm({
  ready,
  requiresCode,
  version,
}: {
  ready: boolean;
  requiresCode: boolean;
  version: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [read, setRead] = useState(false);
  const [electronicConsent, setElectronicConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || sending) {
      return;
    }
    setSending(true);
    setError("");
    try {
      const form = event.currentTarget;
      const honeypot =
        (form.elements.namedItem("website") as HTMLInputElement | null)
          ?.value || "";
      const response = await fetch("/api/acknowledge", {
        body: JSON.stringify({
          accessCode,
          applicantEmail: email,
          electronicConsent,
          fullName,
          policyVersion: version,
          read,
          website: honeypot,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json();
      if (!(response.ok && data.ok)) {
        throw new Error(
          data.error || "We could not send your confirmation. Please try again."
        );
      }
      setReceipt(data as Receipt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSending(false);
    }
  }
  if (receipt) {
    return (
      <div className="success-panel" role="status">
        <div className="success-mark">✓</div>
        <h3>Confirmation sent.</h3>
        <p>
          Thank you, {fullName}. An acknowledgment receipt has been emailed to{" "}
          <strong>{email}</strong> and copied to the property owners. Check your
          inbox and spam folder.
        </p>
        <div className="receipt-divider" />
        <div className="receipt-grid">
          <span>RECEIVED (UTC)</span>
          <strong>
            {new Date(receipt.timestamp).toLocaleString("en-US", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "UTC",
            })}{" "}
            UTC
          </strong>
          <span>RECEIPT ID</span>
          <strong className="code-value">{receipt.recordId}</strong>
          <span>CRITERIA VERSION</span>
          <strong>{receipt.version}</strong>
        </div>
        <p className="success-footnote">
          This confirms receipt of the criteria only. It is not an application
          approval.
        </p>
      </div>
    );
  }

  const resolveResult1 = () => {
    if (ready) {
      if (sending) {
        return "Sending confirmation…";
      }
      return "Confirm I have read the criteria";
    }
    return "Not accepting acknowledgments yet";
  };
  return (
    <form className="ack-form" onSubmit={onSubmit}>
      <div className="fields">
        <label className="field">
          <span>
            Full legal name <span className="req">*</span>
          </span>
          <input
            autoComplete="name"
            disabled={!ready || sending}
            maxLength={120}
            minLength={3}
            name="fullName"
            onChange={(event) => setFullName(event.target.value)}
            placeholder="As shown on your application"
            required
            value={fullName}
          />
        </label>
        <label className="field">
          <span>
            Email address <span className="req">*</span>
          </span>
          <input
            autoComplete="email"
            disabled={!ready || sending}
            maxLength={254}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>
      </div>
      {!!requiresCode && (
        <label className="field full-field">
          <span>
            Access code <span className="req">*</span>
          </span>
          <input
            autoComplete="off"
            disabled={!ready || sending}
            name="accessCode"
            onChange={(event) => setAccessCode(event.target.value)}
            placeholder="Code provided by the landlord"
            required
            value={accessCode}
          />
        </label>
      )}
      <div aria-hidden="true" className="trap-field">
        <label>
          Website{" "}
          <input autoComplete="off" name="website" tabIndex={-1} type="text" />
        </label>
      </div>
      <div className="checkbox-stack">
        <label className="check-row">
          <input
            checked={read}
            disabled={!ready || sending}
            onChange={(event) => setRead(event.target.checked)}
            required
            type="checkbox"
          />
          <span>
            <strong>I have read this.</strong> I acknowledge that the tenant
            selection criteria were made available to me and that I had the
            opportunity to review them.
          </span>
        </label>
        <label className="check-row">
          <input
            checked={electronicConsent}
            disabled={!ready || sending}
            onChange={(event) => setElectronicConsent(event.target.checked)}
            required
            type="checkbox"
          />
          <span>
            I agree to sign this acknowledgment electronically and receive a
            copy at the email address entered above.
          </span>
        </label>
      </div>
      <div className="data-notice">
        Your typed name, email, time of acknowledgment, criteria version, and
        limited technical details (such as IP address) are included in the
        confirmation record and emailed to you and the property owners.
      </div>
      {!!error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <Button
        className="submit-button"
        disabled={!(ready && read && electronicConsent) || sending}
        type="submit"
      >
        <span>{resolveResult1()}</span>
        <span aria-hidden="true">↗</span>
      </Button>
      <p className="button-note">
        Each adult applicant must submit their own acknowledgment. This is not a
        rental approval or lease agreement.
      </p>
    </form>
  );
}
