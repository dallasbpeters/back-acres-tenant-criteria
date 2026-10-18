// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import { type Notice, richText } from "@/lib/adverse/notice";
import {
  applyNoticeTemplate,
  type NoticeTemplateId,
  noticeTemplateRevision,
  noticeTemplateSources,
  noticeTemplates,
} from "@/lib/adverse/templates";
import { requireValue } from "@/lib/required";
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
      notice.template?.id ?? "report-denial"
    ),
    [terms, setTerms] = useState(""),
    [reason, setReason] = useState("");
  const template = requireValue(
      noticeTemplates.find((t) => t.id === selected),
      "Expected noticeTemplates.find((t) => t.id === selected)"
    ),
    conditional = template.action !== "Application denied";

  const resolveResult1 = () => {
    if (selected === "report-deposit") {
      return "Required total deposit and payment terms";
    }
    if (selected === "report-rent") {
      return "Required monthly rent and applicable terms";
    }
    return "Required co-signer qualifications";
  };
  return (
    <details
      aria-label="Notice templates"
      className="notice-template-panel"
      onToggle={(e) => setOpen(e.currentTarget.open)}
      open={open}
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
          disabled={disabled}
          label="Notice template"
          onValueChange={(id) => {
            setSelected(id as NoticeTemplateId);
            setTerms("");
          }}
          value={selected}
        >
          {noticeTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </AppSelect>
        <p className="notice-template-wording">{template.reason}</p>
        {!!conditional && (
          <label className="field">
            {resolveResult1()}
            <textarea
              disabled={disabled}
              maxLength={2000}
              onChange={(e) => setTerms(e.target.value)}
              value={terms}
            />
          </label>
        )}
        <label className="field">
          Specific verified reason (optional)
          <input
            disabled={disabled}
            maxLength={3000}
            onChange={(e) => setReason(e.target.value)}
            value={reason}
          />
          <span className="small-note">
            Use only wording that matches the actual decision and the criteria
            disclosed for this property.
          </span>
        </label>
        <div className="notice-template-footer">
          <Button
            disabled={disabled || (conditional && !terms.trim())}
            onClick={() => {
              onApply(applyNoticeTemplate(notice, selected, terms, reason));
              setOpen(false);
            }}
            type="button"
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
                    <a href={source.url} rel="noreferrer" target="_blank">
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
