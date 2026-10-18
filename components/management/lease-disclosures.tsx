// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import {
  disclosureChoices,
  disclosureFields,
  suppliedDisclosures,
} from "@/lib/leases/disclosures";
import { fieldLabel, type LeaseField } from "@/lib/management/lease-workflow";
import type { LeaseValues } from "@/lib/management/leases";
import { requireValue } from "@/lib/required";

const TextEditor = dynamic(
  () => import("./lease-text-editor").then((m) => m.LeaseTextEditor),
  { ssr: false }
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
    suggested = requireValue(
      suppliedDisclosures.enclosures,
      "Expected suppliedDisclosures.enclosures"
    ).split("\n");

  const resolveResult1 = () => {
    if (hasDefaults) {
      return "Loaded the saved disclosures for this property.";
    }
    if (fromSource) {
      return "Prefilled from your supplied Avail lease. Review the property facts and attachments before using them.";
    }
    return "Choose the statements that apply. The wording is written for you.";
  };
  return (
    <div className="lease-disclosures">
      <p>{resolveResult1()}</p>
      {fields.map((key) => {
        const value = values[key] ?? "",
          choices = disclosureChoices[key as keyof typeof disclosureChoices];

        const resolveResult2 = () => {
          const resolveValue3 = () => {
            if (choices?.some((c) => c.value === value)) {
              return value;
            }
            if (value) {
              return "custom";
            }
            return "";
          };
          if (key === "enclosures") {
            return (
              <>
                <p className="small-note">
                  Select the documents you will include. Listed attachments are
                  not automatically included in the downloaded PDF.
                </p>
                <Button
                  onClick={() => onChange(key, "No additional enclosures.")}
                  type="button"
                >
                  No additional attachments
                </Button>
                <div className="lease-attachment-options">
                  {[...new Set([...suggested, ...attachments])].map((name) => (
                    <label className="check-row" key={name}>
                      <input
                        checked={attachments.includes(name)}
                        onChange={(e) =>
                          onChange(
                            key,
                            e.target.checked
                              ? [
                                  ...attachments.filter(
                                    (n) => n !== "No additional enclosures."
                                  ),
                                  name,
                                ].join("\n")
                              : attachments.filter((n) => n !== name).join("\n")
                          )
                        }
                        type="checkbox"
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </>
            );
          }
          if (choices) {
            return (
              <AppSelect
                disabled={busy}
                label={fieldLabel(key)}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setEditing(key);
                    return;
                  }
                  onChange(key, v);
                  setEditing(null);
                }}
                value={resolveValue3()}
              >
                <option value="">Choose a statement</option>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                <option value="custom">Other / add details</option>
              </AppSelect>
            );
          }
          return null;
        };
        const resolveResult4 = () => {
          if (editing === key) {
            return (
              <TextEditor
                body={value}
                compact
                disabled={busy}
                key={key}
                label={fieldLabel(key)}
                onChange={(text) => onChange(key, text)}
                plain
              />
            );
          }
          if (key === "enclosures") {
            return null;
          }
          return (
            <p className="disclosure-wording">
              {value ||
                "Choose a statement above, or select Edit wording to add the details."}
            </p>
          );
        };
        return (
          <section
            className={[
              "lease-disclosure-card",
              key === "utility_details" || key === "enclosures"
                ? "lease-disclosure-wide"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={key}
          >
            <div className="section-heading-row">
              <h4>{fieldLabel(key)}</h4>
              <Button
                disabled={busy}
                onClick={() => setEditing(editing === key ? null : key)}
                type="button"
              >
                {editing === key ? "Done editing" : "Edit wording"}
              </Button>
            </div>
            {resolveResult2()}
            {resolveResult4()}
            {!!(
              key === "lead_records_receipt" || key === "lead_pamphlet_receipt"
            ) && (
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
          checked={reviewed}
          onChange={(e) => onReviewed(e.target.checked)}
          required
          type="checkbox"
        />
        I reviewed these property statements and the documents to include before
        signing.
      </label>
      <div className="management-actions">
        <Button
          disabled={busy || !reviewed}
          onClick={onSaveDefaults}
          type="button"
        >
          Save disclosures for this property
        </Button>
        {!!hasDefaults && (
          <Button disabled={busy} onClick={onClearDefaults} type="button">
            Clear saved disclosures
          </Button>
        )}
      </div>
    </div>
  );
}
export function disclosureDefaults(values: LeaseValues) {
  return Object.fromEntries(
    disclosureFields
      .filter((key) => values[key]?.trim())
      .map((key) => [key, values[key]])
  ) as LeaseValues;
}
