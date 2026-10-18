import { createHash } from "node:crypto";
import { POLICY, policyRecordText } from "./policy";

export function criteriaHash() {
  return createHash("sha256").update(policyRecordText()).digest("hex");
}

export interface Receipt {
  applicantEmail: string;
  criteriaSHA256: string;
  fullName: string;
  ipAddress: string;
  policyVersion: string;
  recordId: string;
  timestamp: string;
  userAgent: string;
}

export function receiptText(receipt: Receipt) {
  return [
    "TENANT SELECTION CRITERIA — ACKNOWLEDGMENT RECEIPT",
    `Name: ${receipt.fullName}`,
    `Email: ${receipt.applicantEmail}`,
    `Property: ${POLICY.street}, ${POLICY.city}`,
    `Timestamp (UTC): ${receipt.timestamp}`,
    `Record ID: ${receipt.recordId}`,
    `Criteria version: ${receipt.policyVersion}`,
    `Criteria SHA-256: ${receipt.criteriaSHA256}`,
    'Acknowledged: "I have read the criteria and had an opportunity to review them."',
    "Consented to use of electronic signature and receipt: Yes",
    `IP address: ${receipt.ipAddress}`,
    `User agent: ${receipt.userAgent}`,
    "",
    "THIS IS A RECEIPT, NOT AN APPROVAL OR A SIGNED LEASE.",
    "",
    policyRecordText(),
  ].join("\n");
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const m: Record<string, string> = {
      "'": "&#39;",
      '"': "&quot;",
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return m[ch];
  });
}

export function receiptHtml(receipt: Receipt) {
  const labeled = (key: string, value: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#64748b;vertical-align:top">${escapeHtml(key)}</td><td style="padding:6px 0;word-break:break-word">${escapeHtml(value)}</td></tr>`;
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1c2931;max-width:660px;margin:auto">
  <p style="text-transform:uppercase;font-size:11px;letter-spacing:2px;color:#64748b">Back Acres Rental · Confirmation</p>
  <h1 style="font-size:26px;line-height:1.2">Acknowledgment received</h1>
  <p>We received an electronic acknowledgment that the applicant was given the opportunity to review the tenant selection criteria. This does not approve or deny the rental application.</p>
  <table style="border-collapse:collapse;width:100%;border-top:1px solid #d4dadd;border-bottom:1px solid #d4dadd;margin:24px 0">${[
    ["Applicant", receipt.fullName],
    ["Applicant email", receipt.applicantEmail],
    ["Property", `${POLICY.street}, ${POLICY.city}`],
    ["Received (UTC)", receipt.timestamp],
    ["Receipt ID", receipt.recordId],
    ["Criteria version", receipt.policyVersion],
    ["Criteria SHA-256", receipt.criteriaSHA256],
  ]
    .map(([key, value]) => labeled(key, value))
    .join("")}</table>
  <p><strong>Confirmed:</strong> “I have read the criteria and had an opportunity to review them.” The applicant also consented to electronic acknowledgment and email delivery.</p>
  <h2 style="font-size:18px;margin-top:28px">Criteria provided</h2>
  ${POLICY.items.map((item) => `<p><strong>${escapeHtml(item.number)} — ${escapeHtml(item.title)}</strong><br/>${escapeHtml(item.detail)}</p>`).join("")}
  <h2 style="font-size:18px;margin-top:28px">Statutory notice</h2>
  <p style="font-weight:700">${escapeHtml(POLICY.statutoryAcknowledgment)}</p>
  <p style="font-size:12px;color:#64748b;margin-top:28px">Technical record: IP ${escapeHtml(receipt.ipAddress)} · User agent ${escapeHtml(receipt.userAgent)}</p>
  </div>`;
}
