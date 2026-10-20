// biome-ignore-all lint/performance/noJsxPropsBind: Each button sets one fixed status for this application.
"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

const SMARTMOVE_URL = "https://www.mysmartmove.com/";

interface Applicant {
  email: string;
  moveDate: string;
  name: string;
  phone: string;
}

/**
 * The screening step for one application, led by its status: request it in
 * SmartMove with the details ready to paste, mark the results in, then
 * record the decision. The report itself stays with SmartMove.
 */
export function ScreeningPanel({
  applicant,
  busy,
  onStatus,
  propertyAddress,
  status,
}: {
  applicant: Applicant;
  busy: boolean;
  onStatus: (status: string) => void;
  propertyAddress: string;
  status: string;
}) {
  const [copied, setCopied] = useState("");
  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("");
    }
  }, []);
  const details = [
    ["Name", applicant.name],
    ["Email", applicant.email],
    ["Phone", applicant.phone],
    ["Property", propertyAddress],
    ["Move-in", applicant.moveDate],
  ] as const;
  const request = useCallback(async () => {
    await copy(
      "all",
      details.map(([label, value]) => `${label}: ${value}`).join("\n")
    );
    window.open(SMARTMOVE_URL, "_blank", "noopener,noreferrer");
    onStatus("screening_requested");
  }, [copy, details, onStatus]);

  if (status === "approved") {
    return (
      <div className="screening-panel" data-step="done">
        <p>
          <strong>Approved.</strong> Next, prepare their lease under Leases and
          choose them as the tenant.
        </p>
        <a href="/admin#leases">Open Leases</a>
      </div>
    );
  }
  if (status === "declined") {
    return (
      <div className="screening-panel" data-step="attention">
        <p>
          <strong>Declined.</strong> If the decision used the screening report,
          send an adverse action notice that names TransUnion SmartMove.
        </p>
        <a href="/admin/adverse-actions">Prepare the adverse action notice</a>
      </div>
    );
  }
  if (status === "screening_received") {
    return (
      <div className="screening-panel" data-step="current">
        <p>
          <strong>Decide.</strong> Read the report in SmartMove, then record the
          decision here. Don’t save the report in this app.
        </p>
        <div className="management-actions">
          <Button
            disabled={busy}
            onPress={() => onStatus("approved")}
            variant="primary"
          >
            Approve
          </Button>
          <Button
            disabled={busy}
            onPress={() => onStatus("declined")}
            variant="danger"
          >
            Decline
          </Button>
        </div>
      </div>
    );
  }
  if (status === "screening_requested") {
    return (
      <div className="screening-panel" data-step="waiting">
        <p>
          <strong>Waiting on the applicant.</strong> SmartMove emails them to
          verify their identity and pay. You get an email when the report is
          ready.
        </p>
        <div className="management-actions">
          <Button
            disabled={busy}
            onPress={() => onStatus("screening_received")}
            variant="primary"
          >
            Report is ready
          </Button>
          <a href={SMARTMOVE_URL} rel="noreferrer" target="_blank">
            Open SmartMove
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="screening-panel" data-step="current">
      <p>
        <strong>Screen this applicant.</strong> Request screening copies their
        details and opens SmartMove. In SmartMove, choose to screen a renter and
        paste them in. The applicant pays and verifies their identity there.
      </p>
      <dl className="screening-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {value || "—"}
              {!!value && (
                <Button
                  aria-label={`Copy ${label.toLowerCase()}`}
                  className="screening-copy"
                  onPress={() => copy(label, value)}
                  variant="quiet"
                >
                  {copied === label ? "Copied" : "Copy"}
                </Button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="management-actions">
        <Button disabled={busy} onPress={request} variant="primary">
          Request screening in SmartMove
        </Button>
        {copied === "all" && (
          <span className="small-note" role="status">
            Details copied.
          </span>
        )}
      </div>
    </div>
  );
}
