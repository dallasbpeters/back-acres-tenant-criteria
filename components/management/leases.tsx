"use client";
import { useState } from "react";
import {
  generateLease,
  leaseFields,
  leaseFieldLabels,
  templateFields,
  type LeaseValues,
} from "@/lib/management/leases";
import { dollars } from "@/lib/management/model";
import {
  Field,
  type PropertyRecord,
  type TemplateRecord,
  type DraftRecord,
  type Save,
} from "./dashboard";
export function LeaseWorkspace({
  properties,
  templates,
  drafts,
  save,
  busy,
}: {
  properties: PropertyRecord[];
  templates: TemplateRecord[];
  drafts: DraftRecord[];
  save: Save;
  busy: boolean;
}) {
  const [body, setBody] = useState(""),
    [propertyId, setPropertyId] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [tenantName, setTenantName] = useState(""),
    [parentId, setParentId] = useState<string | null>(null),
    [error, setError] = useState("");
  const needed = templateFields(
    templates.find((t) => t.id === templateId)?.body ?? "",
  );
  const automatic = ["property_name", "property_address", "monthly_rent"];
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  return (
    <section>
      <h2>Lease generator</h2>
      <p className="draft-banner">
        The supplied Avail model preserves its 44 clauses and 22 rules. Its
        late-charge clause and summary need reconciliation. Review statutory
        notices, animal accommodations, liability terms, and required enclosures
        before execution. The source PDF listed enclosures but did not include
        their contents.
      </p>
      <p>
        Use your own lease template. Generated documents remain drafts for
        review; this workspace does not execute or electronically sign a lease.
      </p>
      <details className="record">
        <summary>Add a lease template</summary>
        <form
          className="management-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await save({
              action: "leaseTemplate",
              id: crypto.randomUUID(),
              name: f.get("name"),
              body: f.get("body"),
            });
          }}
        >
          <Field name="name" label="Template name / version" />
          <label className="field">
            Lease template text
            <textarea name="body" rows={16} required maxLength={45000} />
          </label>
          <p>
            Paste your authorized template text and insert these placeholders
            where values belong: {leaseFields.map((f) => `{{${f}}}`).join(", ")}
            . Original Word/PDF formatting is not retained in this text
            workflow.
          </p>
          <button className="submit-button" disabled={busy}>
            Save template version
          </button>
        </form>
      </details>
      {!templates.length ? (
        <p className="management-empty">
          Waiting for your lease template. Add the template text above to
          generate a draft.
        </p>
      ) : (
        <form
          className="management-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            const f = new FormData(e.currentTarget),
              p = properties.find((p) => p.id === propertyId),
              t = templates.find((t) => t.id === templateId);
            if (!p || !t) {
              setError("Choose a property and template.");
              return;
            }
            const entered = Object.fromEntries(
              leaseFields.map((key) => [key, String(f.get(key) ?? "")]),
            ) as LeaseValues;
            const values = {
              ...entered,
              property_name: p.data.name,
              property_address: p.data.address,
              monthly_rent: dollars(p.data.rentCents),
              landlord_name: String(f.get("landlord_name")),
              tenant_names: String(f.get("tenant_names")),
              start_date: String(f.get("start_date")),
              end_date: String(f.get("end_date")),
              security_deposit: String(f.get("security_deposit")),
            } satisfies LeaseValues;
            try {
              setBody(generateLease(t.body, values));
              setTenantName(values.tenant_names!);
              setParentId(null);
              setDraftId(crypto.randomUUID());
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Cannot generate draft.",
              );
            }
          }}
        >
          <div className="fields">
            <label className="field">
              Lease property
              <select
                aria-label="Lease property"
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setBody("");
                }}
                required
              >
                <option value="">Choose property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.data.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Lease template
              <select
                aria-label="Lease template"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setBody("");
                }}
                required
              >
                <option value="">Choose template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Field name="landlord_name" label="Landlord legal name" />
            <Field name="tenant_names" label="Tenant legal names" />
            <Field name="start_date" label="Lease start date" type="date" />
            <Field name="end_date" label="Lease end date" type="date" />
            <Field
              name="security_deposit"
              label="Security deposit (formatted amount)"
            />
            {leaseFields
              .filter(
                (key) =>
                  !automatic.includes(key) &&
                  ![
                    "landlord_name",
                    "tenant_names",
                    "start_date",
                    "end_date",
                    "security_deposit",
                  ].includes(key) &&
                  needed.includes(key),
              )
              .map((key) => (
                <label className="field" key={key}>
                  {leaseFieldLabels[key]}
                  <textarea name={key} required rows={3} maxLength={3000} />
                </label>
              ))}
          </div>
          <button className="submit-button" disabled={busy}>
            Generate draft
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {body && (
        <div className="management-section">
          <h3>Review draft</h3>
          <label className="field">
            Draft text
            <textarea
              aria-label="Draft text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={24}
              maxLength={45000}
            />
          </label>
          <button
            className="submit-button"
            disabled={busy}
            onClick={async () => {
              const ok = await save({
                action: "leaseDraft",
                id: draftId,
                propertyId,
                templateId,
                parentId,
                tenantName,
                body,
              });
              if (ok) {
                setParentId(draftId);
                setDraftId(crypto.randomUUID());
              }
            }}
          >
            Save new draft version
          </button>
          <p>
            Every save preserves a new version. Review the complete lease and
            required attachments before signing outside this app.
          </p>
        </div>
      )}
      <h3>Saved drafts</h3>
      {drafts.map((d) => (
        <details className="record" key={d.id}>
          <summary>
            {d.tenantName} · {new Date(d.createdAt).toLocaleString()}
          </summary>
          <p className="document-text">{d.body}</p>
          <div className="management-actions">
            <button
              onClick={() => {
                setPropertyId(d.propertyId);
                setTemplateId(d.templateId);
                setTenantName(d.tenantName);
                setParentId(d.id);
                setBody(d.body);
                setDraftId(crypto.randomUUID());
              }}
            >
              Edit as a new version
            </button>
            <a
              href={`/api/admin/leases/${d.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Download draft PDF
            </a>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([`DRAFT — REVIEW BEFORE SIGNING\n\n${d.body}`], {
                    type: "text/plain",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `lease-draft-${d.id}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download draft text
            </button>
          </div>
        </details>
      ))}
    </section>
  );
}
