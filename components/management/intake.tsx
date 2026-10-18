// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
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
            accuracy: f.get("accuracy") === "on",
            acknowledgment: f.get("acknowledgment") === "on",
            currentAddress: str("currentAddress"),
            email: str("email"),
            housingHistory: str("housingHistory"),
            incomeDetails: str("incomeDetails"),
            monthlyIncome: Number(str("monthlyIncome")),
            moveDate: str("moveDate"),
            name: str("name"),
            notes: str("notes"),
            occupants: Number(str("occupants")),
            phone: str("phone"),
          }
        : {
            accessNotes: str("accessNotes"),
            description: str("description"),
            email: str("email"),
            name: str("name"),
            phone: str("phone"),
            priority: str("priority"),
            subject: str("subject"),
          };
    try {
      const r = await fetch(
        kind === "application" ? "/api/applications" : "/api/maintenance",
        {
          body: JSON.stringify({
            criteriaVersion:
              kind === "application" ? property.criteriaVersion : undefined,
            data,
            id: requestId,
            propertyId,
            revision,
            token,
            website: str("website"),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      const result = await r.json();
      if (!r.ok) {
        throw new Error(result.error);
      }
      setReceipt(result.receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit.");
    } finally {
      setBusy(false);
    }
  }
  if (receipt) {
    return (
      <section className="management-section" role="status">
        <h2>
          {kind === "application" ? "Application received" : "Request received"}
        </h2>
        <p>Reference: {receipt}</p>
        <p>
          Save this reference for your records. Back Acres Rentals will review
          your submission.{" "}
          {kind === "application"
            ? "This is not an approval or a lease. Your email address has not been verified."
            : `For urgent needs, contact ${property.contact} directly.`}
        </p>
        <p>{property.contact}</p>
      </section>
    );
  }
  const resolveResult1 = () => {
    if (busy) {
      return "Saving…";
    }
    if (kind === "application") {
      return "Submit application";
    }
    return "Submit maintenance request";
  };
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
          <Field label="Full name" name="name" />
          <Field label="Email" name="email" type="email" />
          <Field label="Phone" name="phone" type="tel" />
          {kind === "application" ? (
            <>
              <Field label="Current address" name="currentAddress" />
              <Field
                label="Gross monthly income ($)"
                name="monthlyIncome"
                type="number"
              />
              <Field label="Desired move-in date" name="moveDate" type="date" />
              <Field
                label="Number of occupants"
                min="1"
                name="occupants"
                type="number"
              />
            </>
          ) : (
            <>
              <Field label="What needs repair?" name="subject" />
              <AppSelect label={<>Priority</>} name="priority">
                <option value="routine">Routine</option>
                <option value="urgent">
                  Urgent — also contact{" "}
                  {property.emergencyContact || property.contact}
                </option>
              </AppSelect>
            </>
          )}
        </div>
        {kind === "application" ? (
          <>
            <TextArea
              label="Income sources and employment details"
              name="incomeDetails"
            />
            <TextArea
              label="Housing history and references"
              name="housingHistory"
            />
            <TextArea
              label="Additional information (optional)"
              name="notes"
              required={false}
            />
            <label className="check-row">
              <input name="acknowledgment" required type="checkbox" />I have had
              the opportunity to review the selection criteria above. Criteria
              may include criminal history, credit history, current income, and
              rental history. If I do not meet the criteria or provide
              inaccurate or incomplete information, my application may be
              rejected and an application fee, if charged, may not be refunded,
              subject to applicable law.
            </label>
            <label className="check-row">
              <input name="accuracy" required type="checkbox" />I am submitting
              my own application, the information is accurate to the best of my
              knowledge, and I agree to submit it electronically. I understand
              any credit or background screening authorization will be handled
              separately.
            </label>
          </>
        ) : (
          <>
            <TextArea
              label="Describe the issue and its location"
              name="description"
            />
            <TextArea
              label="Access instructions or preferred times (optional)"
              name="accessNotes"
              required={false}
            />
          </>
        )}
        <label aria-hidden="true" className="trap-field">
          Leave blank
          <input autoComplete="off" name="website" tabIndex={-1} />
        </label>
        <p className="small-note">
          Do not enter Social Security numbers, bank details, passwords, or
          medical information. See our <a href="/privacy">Privacy Policy</a>.
        </p>
        {!!error && <p role="alert">{error}</p>}
        <Button
          className="submit-button"
          disabled={busy}
          type="submit"
          variant="primary"
        >
          {resolveResult1()}
        </Button>
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
        maxLength={500}
        min={min}
        name={name}
        required
        step={type === "number" ? "any" : undefined}
        type={type}
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
      <textarea maxLength={3000} name={name} required={required} rows={4} />
    </label>
  );
}
