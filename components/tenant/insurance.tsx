// biome-ignore-all lint/performance/noJsxPropsBind: Native form controls capture the current tenancy and pending state.
"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type InsuranceStanding,
  insuranceStanding,
} from "@/lib/tenant/insurance";

export interface TenantInsuranceDocument {
  carrier: string;
  createdAt: string;
  endsOn: string;
  fileName: string;
  id: string;
  policyNumber: string;
  reviewNote: string;
  startsOn: string;
  status: string;
}

const standingLabel: Record<InsuranceStanding, string> = {
  current: "Active",
  expired: "Expired",
  expiring: "Expires within 30 days",
  future: "Starts later",
};
const reviewLabel: Record<string, string> = {
  accepted: "Accepted",
  pending: "Waiting for review",
  rejected: "New copy needed",
};

export function TenantInsurance({
  accessId,
  documents,
}: {
  accessId: string;
  documents: TenantInsuranceDocument[];
}) {
  const router = useRouter();
  const id = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage("");
    setError("");
    try {
      const data = new FormData(form);
      data.set("id", accessId);
      const response = await fetch("/api/tenant/insurance", {
        body: data,
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Upload failed. Please retry.");
      }
      form.reset();
      setMessage("Insurance document uploaded. The owner will review it.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <header className="tenant-section-head">
        <h3>Renters insurance</h3>
        <p className="small-note">
          Upload your declarations page or certificate of insurance. PDF, JPG,
          or PNG, up to 10 MB.
        </p>
      </header>
      {documents.length ? (
        <ul className="tenant-insurance-list">
          {documents.map((document) => (
            <li key={document.id}>
              <p className="tenant-lease-title">
                {document.carrier} · Policy {document.policyNumber}
              </p>
              <p className="small-note">
                {document.startsOn} to {document.endsOn} ·{" "}
                {
                  standingLabel[
                    insuranceStanding(document.startsOn, document.endsOn)
                  ]
                }{" "}
                · {reviewLabel[document.status] ?? document.status}
              </p>
              {!!document.reviewNote && (
                <p className="small-note">Owner note: {document.reviewNote}</p>
              )}
              <a
                className="property-details-link"
                download
                href={`/api/tenant/insurance/${document.id}`}
              >
                Download {document.fileName}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tenant-empty-state">
          No insurance documents uploaded yet.
        </p>
      )}
      <form className="tenant-insurance-form tenant-panel" onSubmit={submit}>
        <h4>Add a policy</h4>
        <div className="fields">
          <label className="field">
            Insurance company
            <input maxLength={120} name="carrier" required />
          </label>
          <label className="field">
            Policy number
            <input maxLength={80} name="policyNumber" required />
          </label>
          <label className="field">
            Policy start date
            <input name="startsOn" required type="date" />
          </label>
          <label className="field">
            Policy end date
            <input name="endsOn" required type="date" />
          </label>
        </div>
        <label className="field">
          Insurance document
          <input
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            aria-describedby={`${id}-status`}
            name="file"
            required
            type="file"
          />
        </label>
        <div aria-live="polite" id={`${id}-status`}>
          {!!error && <p role="alert">{error}</p>}
          {!!message && <p role="status">{message}</p>}
        </div>
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? "Uploading…" : "Upload insurance"}
        </Button>
      </form>
    </>
  );
}
