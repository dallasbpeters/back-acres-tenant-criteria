"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { AppSelect } from "@/components/ui/select";
import {
  disclosureChoices,
  disclosureFields,
  suppliedDisclosures,
} from "@/lib/leases/disclosures";
import { fieldLabel, type LeaseField } from "@/lib/management/lease-workflow";
import type { LeaseValues } from "@/lib/management/leases";
const TextEditor = dynamic(
  () => import("./lease-text-editor").then((m) => m.LeaseTextEditor),
  { ssr: false },
);
export function LeaseDisclosures({
  fields,
  values,
  onChange,
  reviewed,
  onReviewed,
  busy,
  onSaveDefaults,
  onClearDefaults,
  hasDefaults,
  fromSource,
}: {
  fields: LeaseField[];
  values: LeaseValues;
  onChange: (key: LeaseField, value: string) => void;
  reviewed: boolean;
  onReviewed: (value: boolean) => void;
  busy: boolean;
  onSaveDefaults: () => Promise<void>;
  onClearDefaults: () => Promise<void>;
  hasDefaults: boolean;
  fromSource: boolean;
}) {
  const [editing, setEditing] = useState<LeaseField | null>(null);
  const attachments = (values.enclosures ?? "").split("\n").filter(Boolean),
    suggested = suppliedDisclosures.enclosures!.split("\n");
  return (
    <div className="lease-disclosures">
      <p>
        {hasDefaults
          ? "Loaded the saved disclosures for this property."
          : fromSource
            ? "Prefilled from your supplied Avail lease. Review the property facts and attachments before using them."
            : "Choose the statements that apply. The wording is written for you."}
      </p>
      {fields.map((key) => {
        const value = values[key] ?? "",
          choices = disclosureChoices[key as keyof typeof disclosureChoices];
        return (
          <section
            className={`lease-disclosure-card${key === "utility_details" || key === "enclosures" ? " lease-disclosure-wide" : ""}`}
            key={key}
          >
            <div className="section-heading-row">
              <h4>{fieldLabel(key)}</h4>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(editing === key ? null : key)}
              >
                {editing === key ? "Done editing" : "Edit wording"}
              </button>
            </div>
            {key === "enclosures" ? (
              <>
                <p className="small-note">
                  Select the documents you will include. Listed attachments are
                  not automatically included in the downloaded PDF.
                </p>
                <button
                  type="button"
                  onClick={() => onChange(key, "No additional enclosures.")}
                >
                  No additional attachments
                </button>
                <div className="lease-attachment-options">
                  {[...new Set([...suggested, ...attachments])].map((name) => (
                    <label className="check-row" key={name}>
                      <input
                        type="checkbox"
                        checked={attachments.includes(name)}
                        onChange={(e) =>
                          onChange(
                            key,
                            e.target.checked
                              ? [
                                  ...attachments.filter(
                                    (n) => n !== "No additional enclosures.",
                                  ),
                                  name,
                                ].join("\n")
                              : attachments
                                  .filter((n) => n !== name)
                                  .join("\n"),
                          )
                        }
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </>
            ) : choices ? (
              <AppSelect
                label={fieldLabel(key)}
                value={
                  choices.some((c) => c.value === value)
                    ? value
                    : value
                      ? "custom"
                      : ""
                }
                disabled={busy}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setEditing(key);
                    return;
                  }
                  onChange(key, v);
                  setEditing(null);
                }}
              >
                <option value="">Choose a statement</option>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                <option value="custom">Other / add details</option>
              </AppSelect>
            ) : null}
            {editing === key ? (
              <TextEditor
                key={key}
                label={fieldLabel(key)}
                body={value}
                plain
                compact
                disabled={busy}
                onChange={(text) => onChange(key, text)}
              />
            ) : key !== "enclosures" ? (
              <p className="disclosure-wording">
                {value ||
                  "Choose a statement above, or select Edit wording to add the details."}
              </p>
            ) : null}
            {(key === "lead_records_receipt" ||
              key === "lead_pamphlet_receipt") && (
              <p className="small-note">
                Acknowledgment wording for signing. This draft does not confirm
                the tenant has received anything.
              </p>
            )}
          </section>
        );
      })}
      <label className="check-row">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => onReviewed(e.target.checked)}
          required
        />
        I reviewed these property statements and the documents to include before
        signing.
      </label>
      <div className="management-actions">
        <button
          type="button"
          disabled={busy || !reviewed}
          onClick={onSaveDefaults}
        >
          Save disclosures for this property
        </button>
        {hasDefaults && (
          <button type="button" disabled={busy} onClick={onClearDefaults}>
            Clear saved disclosures
          </button>
        )}
      </div>
    </div>
  );
}
export function disclosureDefaults(values: LeaseValues) {
  return Object.fromEntries(
    disclosureFields
      .filter((key) => values[key]?.trim())
      .map((key) => [key, values[key]]),
  ) as LeaseValues;
}
