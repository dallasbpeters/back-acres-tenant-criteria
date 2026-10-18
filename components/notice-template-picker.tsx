"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import {
  applyNoticeTemplate,
  noticeTemplates,
  noticeTemplateSources,
  noticeTemplateRevision,
  type NoticeTemplateId,
} from "@/lib/adverse/templates";
import { richText, type Notice } from "@/lib/adverse/notice";
export function NoticeTemplatePicker({
  notice,
  disabled,
  onApply,
}: {
  notice: Notice;
  disabled: boolean;
  onApply: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(!richText(notice.reasons).trim());
  const [selected, setSelected] = useState<NoticeTemplateId>(
      notice.template?.id ?? "report-denial",
    ),
    [terms, setTerms] = useState(""),
    [reason, setReason] = useState("");
  const template = noticeTemplates.find((t) => t.id === selected)!,
    conditional = template.action !== "Application denied";
  return (
    <details
      className="notice-template-panel"
      aria-label="Notice templates"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span>Start with a template</span>
        <span className="notice-template-applied">
          {notice.template ? "Template applied" : "Source-backed drafts"}
        </span>
      </summary>
      <div className="notice-template-content">
        <div className="notice-template-heading">
          <div>
            <p>
              Editable drafts based on the sources below. Attorney approval is
              not yet recorded.
            </p>
          </div>
        </div>
        <AppSelect
          label="Notice template"
          value={selected}
          disabled={disabled}
          onValueChange={(id) => {
            setSelected(id as NoticeTemplateId);
            setTerms("");
          }}
        >
          {noticeTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </AppSelect>
        <p className="notice-template-wording">{template.reason}</p>
        {conditional && (
          <label className="field">
            {selected === "report-deposit"
              ? "Required total deposit and payment terms"
              : selected === "report-rent"
                ? "Required monthly rent and applicable terms"
                : "Required co-signer qualifications"}
            <textarea
              value={terms}
              maxLength={2000}
              disabled={disabled}
              onChange={(e) => setTerms(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          Specific verified reason (optional)
          <input
            value={reason}
            maxLength={3000}
            disabled={disabled}
            onChange={(e) => setReason(e.target.value)}
          />
          <span className="small-note">
            Use only wording that matches the actual decision and the criteria
            disclosed for this property.
          </span>
        </label>
        <div className="notice-template-footer">
          <Button
            type="button"
            disabled={disabled || (conditional && !terms.trim())}
            onClick={() => {
              onApply(applyNoticeTemplate(notice, selected, terms, reason));
              setOpen(false);
            }}
          >
            {richText(notice.reasons).trim()
              ? "Replace reasons with template"
              : "Use template"}
          </Button>
          <details>
            <summary>Sources and review status</summary>
            <p>
              Source-backed draft · Revision {noticeTemplateRevision}. This
              wording has not been reviewed or approved by an attorney for Back
              Acres. Editing a sourced draft does not make it attorney-approved.
            </p>
            <ul>
              {template.sources.map((key) => {
                const source = noticeTemplateSources[key];
                return (
                  <li key={key}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title} ↗
                    </a>
                  </li>
                );
              })}
            </ul>
            <p>
              The reporting-agency contacts, dispute rights, 60-day free-report
              notice, and credit-score disclosures are filled from the notice
              fields. Confirm the agencies and any score actually used before
              sending.
            </p>
          </details>
        </div>
      </div>
    </details>
  );
}
