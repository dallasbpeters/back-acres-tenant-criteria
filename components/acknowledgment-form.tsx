"use client";
import { Button } from "@/components/ui/button";

import { useState, type FormEvent } from "react";

type Receipt = { recordId: string; timestamp: string; version: string };

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
    if (!ready || sending) return;
    setSending(true);
    setError("");
    try {
      const form = event.currentTarget;
      const honeypot =
        (form.elements.namedItem("website") as HTMLInputElement | null)
          ?.value || "";
      const response = await fetch("/api/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          applicantEmail: email,
          accessCode,
          read,
          electronicConsent,
          policyVersion: version,
          website: honeypot,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok)
        throw new Error(
          data.error ||
            "We could not send your confirmation. Please try again.",
        );
      setReceipt(data as Receipt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }

  if (receipt)
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
              timeZone: "UTC",
              dateStyle: "long",
              timeStyle: "short",
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

  return (
    <form className="ack-form" onSubmit={onSubmit}>
      <div className="fields">
        <label className="field">
          <span>
            Full legal name <span className="req">*</span>
          </span>
          <input
            autoComplete="name"
            name="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={3}
            maxLength={120}
            required
            disabled={!ready || sending}
            placeholder="As shown on your application"
          />
        </label>
        <label className="field">
          <span>
            Email address <span className="req">*</span>
          </span>
          <input
            autoComplete="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            maxLength={254}
            required
            disabled={!ready || sending}
            placeholder="you@example.com"
          />
        </label>
      </div>
      {requiresCode && (
        <label className="field full-field">
          <span>
            Access code <span className="req">*</span>
          </span>
          <input
            name="accessCode"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            autoComplete="off"
            required
            disabled={!ready || sending}
            placeholder="Code provided by the landlord"
          />
        </label>
      )}
      <div className="trap-field" aria-hidden="true">
        <label>
          Website{" "}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="checkbox-stack">
        <label className="check-row">
          <input
            type="checkbox"
            checked={read}
            onChange={(event) => setRead(event.target.checked)}
            required
            disabled={!ready || sending}
          />
          <span>
            <strong>I have read this.</strong> I acknowledge that the tenant
            selection criteria were made available to me and that I had the
            opportunity to review them.
          </span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={electronicConsent}
            onChange={(event) => setElectronicConsent(event.target.checked)}
            required
            disabled={!ready || sending}
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
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <Button
        className="submit-button"
        type="submit"
        disabled={!ready || !read || !electronicConsent || sending}
      >
        <span>
          {!ready
            ? "Not accepting acknowledgments yet"
            : sending
              ? "Sending confirmation…"
              : "Confirm I have read the criteria"}
        </span>
        <span aria-hidden="true">↗</span>
      </Button>
      <p className="button-note">
        Each adult applicant must submit their own acknowledgment. This is not a
        rental approval or lease agreement.
      </p>
    </form>
  );
}
