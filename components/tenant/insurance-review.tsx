// biome-ignore-all lint/performance/noJsxPropsBind: Native controls capture the current document row and its draft note.
"use client";
import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "@/components/management/section-card";
import { Button } from "@/components/ui/button";
import type { InsuranceStanding } from "@/lib/tenant/insurance";

interface OwnerInsuranceDocument {
  carrier: string;
  createdAt: string;
  endsOn: string;
  fileName: string;
  id: string;
  policyNumber: string;
  propertyName: string;
  reviewNote: string;
  standing: InsuranceStanding;
  startsOn: string;
  status: "accepted" | "pending" | "rejected";
  tenantName: string;
}

const standingLabel: Record<InsuranceStanding, string> = {
  current: "Active",
  expired: "Expired",
  expiring: "Expires within 30 days",
  future: "Starts later",
};
const statusLabel = {
  accepted: "Accepted",
  pending: "Needs review",
  rejected: "New copy requested",
};

export function InsuranceReview() {
  const [documents, setDocuments] = useState<OwnerInsuranceDocument[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/insurance");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not load insurance documents.");
    }
    setDocuments(data.documents);
  }, []);
  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);
  async function review(
    document: OwnerInsuranceDocument,
    status: "accepted" | "rejected"
  ) {
    setPending(document.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/insurance", {
        body: JSON.stringify({
          id: document.id,
          note: notes[document.id] ?? "",
          status,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Could not save the review.");
      }
      setMessage(
        status === "accepted"
          ? `Accepted insurance for ${document.tenantName}.`
          : `Asked ${document.tenantName} for a new copy.`
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }
  return (
    <SectionCard className="insurance-review" labelledBy="insurance-review">
      <h2 id="insurance-review">Renters insurance</h2>
      <p className="small-note">
        Renters upload proof of insurance from the tenant portal. Check the
        document, then accept it or ask for a new copy. The renter sees your
        decision and note.
      </p>
      <div aria-live="polite">
        {!!error && <p role="alert">{error}</p>}
        {!!message && <p role="status">{message}</p>}
      </div>
      {documents.length ? (
        <ul className="insurance-review-list">
          {documents.map((document) => (
            <li key={document.id}>
              <p className="tenant-lease-title">
                {document.tenantName} · {document.propertyName}
              </p>
              <p className="small-note">
                {document.carrier} · Policy {document.policyNumber} ·{" "}
                {document.startsOn} to {document.endsOn} ·{" "}
                <strong>{standingLabel[document.standing]}</strong> ·{" "}
                {statusLabel[document.status]}
              </p>
              {!!document.reviewNote && (
                <p className="small-note">Your note: {document.reviewNote}</p>
              )}
              <a
                className="property-details-link"
                download
                href={`/api/admin/insurance/${document.id}`}
              >
                Download {document.fileName}
              </a>
              <label className="field">
                Note to renter (required to ask for a new copy)
                <input
                  maxLength={500}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [document.id]: event.target.value,
                    }))
                  }
                  value={notes[document.id] ?? ""}
                />
              </label>
              <div className="management-actions">
                <Button
                  disabled={pending === document.id}
                  onClick={() => review(document, "accepted")}
                  variant="primary"
                >
                  Accept
                </Button>
                <Button
                  disabled={pending === document.id}
                  onClick={() => review(document, "rejected")}
                >
                  Ask for a new copy
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No insurance documents uploaded yet.</p>
      )}
    </SectionCard>
  );
}
