"use client";
import { useState } from "react";
import type { PropertyInput } from "@/lib/management/model";
export function IntakeForm({
  kind,
  property,
  propertyId,
  revision,
  token,
}: {
  kind: "application" | "maintenance";
  property: Pick<
    PropertyInput,
    "criteria" | "criteriaVersion" | "contact" | "emergencyContact"
  >;
  propertyId?: string;
  revision?: number;
  token?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "");
    const data =
      kind === "application"
        ? {
            name: str("name"),
            email: str("email"),
            phone: str("phone"),
            currentAddress: str("currentAddress"),
            monthlyIncome: Number(str("monthlyIncome")),
            incomeDetails: str("incomeDetails"),
            housingHistory: str("housingHistory"),
            moveDate: str("moveDate"),
            occupants: Number(str("occupants")),
            notes: str("notes"),
            acknowledgment: f.get("acknowledgment") === "on",
            accuracy: f.get("accuracy") === "on",
          }
        : {
            name: str("name"),
            email: str("email"),
            phone: str("phone"),
            subject: str("subject"),
            description: str("description"),
            priority: str("priority"),
            accessNotes: str("accessNotes"),
          };
    try {
      const r = await fetch(
        kind === "application" ? "/api/applications" : "/api/maintenance",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: requestId,
            propertyId,
            revision,
            criteriaVersion:
              kind === "application" ? property.criteriaVersion : undefined,
            token,
            website: str("website"),
            data,
          }),
        },
      );
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setReceipt(result.receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit.");
    } finally {
      setBusy(false);
    }
  }
  if (receipt)
    return (
      <section className="management-section" role="status">
        <h2>
          {kind === "application" ? "Application received" : "Request received"}
        </h2>
        <p>Reference: {receipt}</p>
        <p>
          Save this reference for your records. The owner will review your
          submission.{" "}
          {kind === "application"
            ? "This is not an approval or a lease. Your email address has not been verified."
            : "For urgent needs, contact the owner directly."}
        </p>
        <p>{property.contact}</p>
      </section>
    );
  return (
    <form className="management-form" onSubmit={submit}>
      {kind === "application" ? (
        <section>
          <h2>Selection criteria</h2>
          <p>Version: {property.criteriaVersion}</p>
          <div className="document-text">{property.criteria}</div>
          <p>
            No application fee is collected by this form. Any screening
            invitation or payment request will be provided separately with the
            amount disclosed.
          </p>
        </section>
      ) : (
        <p className="draft-banner">
          This form is not monitored for emergencies. For immediate danger, call
          911. For urgent repairs:{" "}
          {property.emergencyContact || property.contact}.
        </p>
      )}
      <fieldset disabled={busy}>
        <legend>
          {kind === "application" ? "Your application" : "Repair details"}
        </legend>
        <div className="fields">
          <Field name="name" label="Full name" />
          <Field name="email" label="Email" type="email" />
          <Field name="phone" label="Phone" type="tel" />
          {kind === "application" ? (
            <>
              <Field name="currentAddress" label="Current address" />
              <Field
                name="monthlyIncome"
                label="Gross monthly income ($)"
                type="number"
              />
              <Field name="moveDate" label="Desired move-in date" type="date" />
              <Field
                name="occupants"
                label="Number of occupants"
                type="number"
                min="1"
              />
            </>
          ) : (
            <>
              <Field name="subject" label="What needs repair?" />
              <label className="field">
                Priority
                <select name="priority">
                  <option value="routine">Routine</option>
                  <option value="urgent">
                    Urgent — also contact the owner
                  </option>
                </select>
              </label>
            </>
          )}
        </div>
        {kind === "application" ? (
          <>
            <TextArea
              name="incomeDetails"
              label="Income sources and employment details"
            />
            <TextArea
              name="housingHistory"
              label="Housing history and references"
            />
            <TextArea
              name="notes"
              label="Additional information (optional)"
              required={false}
            />
            <label className="check-row">
              <input name="acknowledgment" type="checkbox" required />I have had
              the opportunity to review the selection criteria above. Criteria
              may include criminal history, credit history, current income, and
              rental history. If I do not meet the criteria or provide
              inaccurate or incomplete information, my application may be
              rejected and an application fee, if charged, may not be refunded,
              subject to applicable law.
            </label>
            <label className="check-row">
              <input name="accuracy" type="checkbox" required />I am submitting
              my own application, the information is accurate to the best of my
              knowledge, and I agree to submit it electronically. I understand
              any credit or background screening authorization will be handled
              separately.
            </label>
          </>
        ) : (
          <>
            <TextArea
              name="description"
              label="Describe the issue and its location"
            />
            <TextArea
              name="accessNotes"
              label="Access instructions or preferred times (optional)"
              required={false}
            />
          </>
        )}
        <label className="trap-field" aria-hidden="true">
          Leave blank
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <p className="small-note">
          Do not enter Social Security numbers, bank details, passwords, or
          medical information. See our <a href="/privacy">Privacy Policy</a>.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="submit-button" disabled={busy}>
          {busy
            ? "Saving…"
            : kind === "application"
              ? "Submit application"
              : "Submit maintenance request"}
        </button>
      </fieldset>
    </form>
  );
}
function Field({
  label,
  name,
  type = "text",
  min = "0",
}: {
  label: string;
  name: string;
  type?: string;
  min?: string;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        required
        maxLength={500}
        min={min}
        step={type === "number" ? "any" : undefined}
      />
    </label>
  );
}
function TextArea({
  label,
  name,
  required = true,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <textarea name={name} required={required} rows={4} maxLength={3000} />
    </label>
  );
}
