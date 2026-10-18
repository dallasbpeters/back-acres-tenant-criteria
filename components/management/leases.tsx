"use client";
import { useEffect, useRef, useState } from "react";
import { AppSelect } from "@/components/ui/select";
import {
  generateLease,
  templateFields,
  type LeaseValues,
} from "@/lib/management/leases";
import {
  fieldLabel,
  initialLeaseValues,
  leaseFormValues,
  leaseSteps,
  missingLeaseDetails,
  moneyFields,
  normalizedLeaseValues,
  questionsFor,
  type LeaseField,
} from "@/lib/management/lease-workflow";
import { dollars } from "@/lib/management/model";
import dynamic from "next/dynamic";
const LeaseWordingEditor = dynamic(
  () => import("./lease-wording-editor").then((m) => m.LeaseWordingEditor),
  { ssr: false, loading: () => <p role="status">Loading document editor…</p> },
);
import type {
  PropertyRecord,
  TemplateRecord,
  DraftRecord,
  Save,
} from "./dashboard";
type Applicant = { id: string; propertyId: string; name: string };
const longAnswers: LeaseField[] = [
  "tenant_names",
  "landlord_notice_address",
  "payment_instructions",
  "habitability_disclosure",
  "foreclosure_disclosure",
  "utility_details",
  "bedbug_disclosure",
  "lead_paint_knowledge",
  "lead_paint_records",
  "lead_records_receipt",
  "lead_pamphlet_receipt",
  "enclosures",
];
export function LeaseWorkspace({
  properties,
  templates,
  drafts,
  applicants = [],
  save,
  busy,
}: {
  properties: PropertyRecord[];
  templates: TemplateRecord[];
  drafts: DraftRecord[];
  applicants?: Applicant[];
  save: Save;
  busy: boolean;
}) {
  const preferred =
    templates.find((t) => t.id === "91268531-0000-4000-8000-000000000001") ??
    templates[0];
  const [propertyId, setPropertyId] = useState(
      properties.length === 1 ? properties[0].id : "",
    ),
    [templateId, setTemplateId] = useState(preferred?.id ?? ""),
    [values, setValues] = useState<LeaseValues>(() =>
      initialLeaseValues(
        properties.length === 1 ? properties[0].data : undefined,
      ),
    ),
    [step, setStep] = useState(0),
    [furthest, setFurthest] = useState(0),
    [body, setBody] = useState(""),
    [bodyEdited, setBodyEdited] = useState(false),
    [parentId, setParentId] = useState<string | null>(null),
    [draftId, setDraftId] = useState(() => crypto.randomUUID()),
    [tenantName, setTenantName] = useState(""),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [savedId, setSavedId] = useState(""),
    [editingDocument, setEditingDocument] = useState(false),
    [wordingSourceId, setWordingSourceId] = useState(""),
    [wordingOpen, setWordingOpen] = useState(false),
    [wording, setWording] = useState(""),
    [wordingName, setWordingName] = useState(""),
    [wordingDirty, setWordingDirty] = useState(false),
    [applicantId, setApplicantId] = useState("");
  const template = templates.find((t) => t.id === templateId),
    property = properties.find((p) => p.id === propertyId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || wordingDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const signOut = (event: Event) => {
      if (
        (dirty || wordingDirty) &&
        !window.confirm("Leave without saving your lease changes?")
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("owner-sign-out", signOut);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("owner-sign-out", signOut);
    };
  }, [dirty, wordingDirty]);
  function go(next: number) {
    setStep(next);
    setError("");
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start" });
    });
  }
  function change(key: LeaseField, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setSavedId("");
  }
  function startNew() {
    if (
      (dirty || wordingDirty) &&
      !window.confirm("Start a new lease without saving these changes?")
    )
      return;
    setWordingOpen(false);
    setWordingDirty(false);
    setValues(initialLeaseValues(property?.data));
    setBody("");
    setBodyEdited(false);
    setParentId(null);
    setDraftId(crypto.randomUUID());
    setTenantName("");
    setSavedId("");
    setDirty(false);
    setApplicantId("");
    setFurthest(0);
    setEditingDocument(false);
    go(0);
  }
  function next() {
    setError("");
    if (!property || !template) {
      setError("Choose a property and a lease document.");
      return;
    }
    if (step === 1) {
      try {
        normalizedLeaseValues(values);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Check the payment details.");
        return;
      }
    }
    if (step < 2) {
      setFurthest((n) => Math.max(n, step + 1));
      go(step + 1);
      return;
    }
    try {
      const normalized = normalizedLeaseValues({
        ...values,
        property_name: property.data.name,
        property_address: property.data.address,
      });
      const missing = missingLeaseDetails(template.body, normalized);
      if (missing.length)
        throw Error(`Complete these lease details: ${missing.join(", ")}.`);
      if (
        bodyEdited &&
        !window.confirm(
          "Rebuild the lease from these details? Changes made directly to the document will be replaced.",
        )
      )
        return;
      const generated = generateLease(template.body, normalized);
      if (generated.length > 45000)
        throw Error(
          "This lease is too long to save. Shorten the added details and try again.",
        );
      setBody(generated);
      setBodyEdited(false);
      setTenantName(normalized.tenant_names?.trim() ?? "");
      setDirty(true);
      setSavedId("");
      setEditingDocument(false);
      setFurthest(3);
      go(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the lease details.");
    }
  }
  async function saveDraft() {
    setError("");
    if (templateFields(body).length) {
      setError(
        "The document still has an unfilled detail. Return to the lease questions before saving.",
      );
      return;
    }
    if (!body.trim()) {
      setError("The lease document cannot be empty.");
      return;
    }
    const ok = await save({
      action: "leaseDraft",
      id: draftId,
      propertyId,
      templateId,
      parentId,
      tenantName,
      body,
      values: normalizedLeaseValues(values),
    });
    if (ok) {
      setParentId(draftId);
      setSavedId(draftId);
      setDraftId(crypto.randomUUID());
      setDirty(false);
    }
  }
  function earlierVersions(d: DraftRecord) {
    const versions: DraftRecord[] = [],
      seen = new Set([d.id]);
    let parent = d.parentId;
    while (parent && !seen.has(parent)) {
      const previous = drafts.find((v) => v.id === parent);
      if (!previous) break;
      versions.push(previous);
      seen.add(previous.id);
      parent = previous.parentId;
    }
    return versions;
  }
  function openDraft(d: DraftRecord) {
    if (
      dirty &&
      !window.confirm(
        "Open this saved lease without saving your current changes?",
      )
    )
      return;
    setPropertyId(d.propertyId);
    setTemplateId(d.templateId);
    setTenantName(d.tenantName);
    setParentId(d.id);
    setBody(d.body);
    setValues(leaseFormValues(d.values ?? {}));
    let manuallyEdited = true;
    try {
      const source = templates.find((t) => t.id === d.templateId);
      if (source && d.values)
        manuallyEdited = generateLease(source.body, d.values) !== d.body;
    } catch {
      /* Keep the saved document authoritative. */
    }
    setBodyEdited(manuallyEdited);
    setSavedId(d.id);
    setDraftId(crypto.randomUUID());
    setDirty(false);
    setFurthest(3);
    setEditingDocument(false);
    go(3);
  }
  function openWording() {
    if (wordingOpen) return;
    setWordingSourceId(templateId);
    setWording(template?.body ?? "");
    setWordingName(
      template ? `${template.name} · revised` : "Back Acres lease",
    );
    setWordingDirty(false);
    setWordingOpen(true);
    setError("");
  }
  return (
    <section className="lease-workspace">
      <div className="section-heading-row">
        <div>
          <h2>Prepare a lease</h2>
          <p>
            Fill in the rental details, then review and download your lease
            draft.
          </p>
        </div>
        <div className="management-actions">
          <button type="button" disabled={busy} onClick={startNew}>
            New lease
          </button>
          <button type="button" disabled={busy} onClick={openWording}>
            Lease wording
          </button>
        </div>
      </div>
      {wordingOpen ? (
        <section
          className="lease-wording-panel"
          aria-label="Edit lease wording"
        >
          <h3>Lease wording</h3>
          <p>
            Make a separate copy when you need to change the document. Existing
            leases keep their original wording.
          </p>
          {templates.length > 0 && (
            <AppSelect
              label="Start from"
              value={wordingSourceId}
              disabled={busy}
              onValueChange={(id) => {
                if (
                  wordingDirty &&
                  !window.confirm(
                    "Replace the wording changes you haven’t saved?",
                  )
                )
                  return;
                const t = templates.find((t) => t.id === id)!;
                setWordingSourceId(id);
                setWording(t.body);
                setWordingName(`${t.name} · revised`);
                setWordingDirty(false);
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </AppSelect>
          )}
          <label className="field">
            Document name
            <input
              value={wordingName}
              onChange={(e) => {
                setWordingName(e.target.value);
                setWordingDirty(true);
              }}
              maxLength={300}
              disabled={busy}
            />
          </label>
          <LeaseWordingEditor
            key={wordingSourceId}
            body={wording}
            onChange={(value) => {
              setWording(value);
              setWordingDirty(true);
            }}
            disabled={busy}
          />
          <div className="management-actions">
            <button
              type="button"
              className="submit-button"
              disabled={
                busy ||
                !wordingName.trim() ||
                !wording.trim() ||
                wording.length > 45000
              }
              onClick={async () => {
                const id = crypto.randomUUID();
                const ok = await save({
                  action: "leaseTemplate",
                  id,
                  name: wordingName.trim(),
                  body: wording,
                });
                if (ok) {
                  setTemplateId(id);
                  setParentId(null);
                  setDraftId(crypto.randomUUID());
                  setDirty(true);
                  setWordingOpen(false);
                  setWordingDirty(false);
                  setBody("");
                  setFurthest(0);
                  go(0);
                }
              }}
            >
              Save as a new document
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  !wordingDirty ||
                  window.confirm("Close without saving the wording changes?")
                ) {
                  setWordingOpen(false);
                  setWordingDirty(false);
                }
              }}
            >
              Back to lease
            </button>
          </div>
        </section>
      ) : (
        <>
          <ol className="lease-progress" aria-label="Lease progress">
            {leaseSteps.map((label, i) => (
              <li key={label} aria-current={step === i ? "step" : undefined}>
                <button
                  type="button"
                  disabled={busy || i > furthest || (i === 3 && step !== 3)}
                  onClick={() => go(i)}
                >
                  <span>{i + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
          <div className="lease-flow">
            <div className="lease-questions">
              <h3 ref={heading} tabIndex={-1} className="lease-step-heading">
                {leaseSteps[step]}
              </h3>
              {step !== 3 ? (
                <form
                  className="management-form lease-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    next();
                  }}
                >
                  <fieldset disabled={busy}>
                    {step === 0 && (
                      <>
                        <AppSelect
                          label="Property"
                          name="leasePropertyId"
                          value={propertyId}
                          required
                          onValueChange={(id) => {
                            const p = properties.find((p) => p.id === id)!;
                            setPropertyId(id);
                            setParentId(null);
                            setDraftId(crypto.randomUUID());
                            setValues((v) => ({
                              ...v,
                              ...initialLeaseValues(p.data),
                              tenant_names: "",
                            }));
                            setApplicantId("");
                            setDirty(true);
                            setSavedId("");
                          }}
                        >
                          <option value="">Choose a property</option>
                          {properties.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.data.name} · {p.data.address}
                            </option>
                          ))}
                        </AppSelect>
                        {templates.length > 1 ? (
                          <AppSelect
                            label="Lease document"
                            value={templateId}
                            required
                            onValueChange={(id) => {
                              setTemplateId(id);
                              setParentId(null);
                              setDraftId(crypto.randomUUID());
                              setDirty(true);
                              setFurthest(0);
                            }}
                          >
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </AppSelect>
                        ) : (
                          <p className="small-note">
                            Based on your supplied lease. Use Lease wording only
                            when you need to change its text.
                          </p>
                        )}
                        {!templates.length && (
                          <p className="management-empty">
                            Add your lease document using Lease wording to
                            begin.
                          </p>
                        )}
                        {applicants.some(
                          (a) => a.propertyId === propertyId,
                        ) && (
                          <AppSelect
                            label="Fill tenant from an application"
                            value={applicantId}
                            onValueChange={(id) => {
                              setApplicantId(id);
                              const applicant = applicants.find(
                                (a) => a.id === id,
                              );
                              if (applicant)
                                change("tenant_names", applicant.name);
                            }}
                          >
                            <option value="">
                              Choose an applicant, or enter the name below
                            </option>
                            {applicants
                              .filter((a) => a.propertyId === propertyId)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                          </AppSelect>
                        )}
                      </>
                    )}
                    {step === 1 && (
                      <p className="small-note">
                        Monthly rent comes from the property. Check every
                        amount; enter 0 where no fee applies.
                      </p>
                    )}
                    {step === 2 && (
                      <p className="small-note">
                        Describe the facts for this property and the documents
                        actually provided. Tenant receipt acknowledgments must
                        match what the tenant receives.
                      </p>
                    )}
                    <div className="fields lease-fields">
                      {questionsFor(template?.body ?? "", step).map((key) => (
                        <label
                          className={`field${longAnswers.includes(key) ? " lease-wide" : ""}`}
                          key={key}
                        >
                          {fieldLabel(key)}
                          {moneyFields.includes(key) ? " ($)" : ""}
                          {longAnswers.includes(key) ? (
                            <textarea
                              aria-label={fieldLabel(key)}
                              name={key}
                              value={values[key] ?? ""}
                              onChange={(e) => change(key, e.target.value)}
                              required
                              rows={key === "tenant_names" ? 2 : 3}
                              maxLength={key === "tenant_names" ? 300 : 3000}
                            />
                          ) : (
                            <input
                              name={key}
                              value={values[key] ?? ""}
                              onChange={(e) => change(key, e.target.value)}
                              required
                              type={
                                key.endsWith("_date")
                                  ? "date"
                                  : moneyFields.includes(key) ||
                                      key === "rent_due_day"
                                    ? "number"
                                    : key === "landlord_email"
                                      ? "email"
                                      : key === "landlord_phone"
                                        ? "tel"
                                        : "text"
                              }
                              {...(moneyFields.includes(key)
                                ? { min: 0, max: 100000, step: "0.01" }
                                : {})}
                              {...(key === "rent_due_day"
                                ? { min: 1, max: 28, step: 1 }
                                : {})}
                              maxLength={3000}
                            />
                          )}
                          {key === "tenant_names" && (
                            <span className="small-note">
                              One adult tenant per line.
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    {step === 2 &&
                      questionsFor(template?.body ?? "", 2).length === 0 && (
                        <p>
                          This document has no additional disclosure questions.
                        </p>
                      )}
                    <div className="lease-step-actions">
                      {step > 0 && (
                        <button type="button" onClick={() => go(step - 1)}>
                          Back
                        </button>
                      )}
                      <button
                        className="submit-button"
                        disabled={!template || !properties.length}
                      >
                        {step === 2 ? "Review lease" : "Continue"}
                      </button>
                    </div>
                  </fieldset>
                </form>
              ) : (
                <>
                  <p className="lease-review-note">
                    Draft for review. No signatures have been collected.
                  </p>
                  <details className="lease-review-checks">
                    <summary>Before signing</summary>
                    <p>
                      Check the late-fee summary against the late-fee clause,
                      statutory notices, animal accommodations, liability terms,
                      and required attachments. The supplied PDF listed
                      enclosures but did not include them. This workspace does
                      not execute or electronically sign a lease.
                    </p>
                  </details>
                  <div className="management-actions lease-review-actions">
                    <button
                      type="button"
                      className="submit-button"
                      disabled={busy || (!dirty && !!savedId)}
                      onClick={saveDraft}
                    >
                      {savedId && !dirty
                        ? "Draft saved"
                        : parentId
                          ? "Save new version"
                          : "Save lease draft"}
                    </button>
                    {savedId && (
                      <a
                        href={`/api/admin/leases/${savedId}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download draft PDF
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDocument((v) => !v);
                      }}
                    >
                      {editingDocument ? "Read document" : "Edit document text"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob(
                            [`DRAFT — REVIEW BEFORE SIGNING\n\n${body}`],
                            { type: "text/plain" },
                          ),
                        );
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "lease-draft.txt";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download text
                    </button>
                    {values.tenant_names && (
                      <button type="button" onClick={() => go(0)}>
                        Edit lease details
                      </button>
                    )}
                  </div>
                  {editingDocument ? (
                    <label className="field">
                      Lease document text
                      <textarea
                        aria-label="Lease document text"
                        rows={24}
                        maxLength={45000}
                        value={body}
                        onChange={(e) => {
                          setBody(e.target.value);
                          setBodyEdited(true);
                          setDirty(true);
                          setSavedId("");
                        }}
                      />
                    </label>
                  ) : (
                    <article
                      className="lease-document"
                      aria-label="Lease draft preview"
                    >
                      {body.split(/\n\n/).map((paragraph, i) => (
                        <p
                          key={i}
                          className={
                            /^(?:§|TERMS$|TENANTS$|LANDLORD$|TEXAS RESIDENTIAL|\d+\.\s[^\n]{1,80}$)/.test(
                              paragraph,
                            )
                              ? "lease-document-heading"
                              : undefined
                          }
                        >
                          {paragraph}
                        </p>
                      ))}
                    </article>
                  )}
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <aside className="lease-summary" aria-label="Lease summary">
              <p className="eyebrow">Your lease</p>
              <h3>{property?.data.name || "Choose a property"}</h3>
              {property && <p>{property.data.address}</p>}
              <dl>
                <div>
                  <dt>Tenant</dt>
                  <dd>{values.tenant_names || tenantName || "Not entered"}</dd>
                </div>
                <div>
                  <dt>Lease dates</dt>
                  <dd>
                    {values.start_date && values.end_date
                      ? `${values.start_date} — ${values.end_date}`
                      : step === 3
                        ? "See document"
                        : "Not entered"}
                  </dd>
                </div>
                <div>
                  <dt>Monthly rent</dt>
                  <dd>
                    {values.monthly_rent
                      ? dollars(
                          Number(values.monthly_rent.replace(/[$,]/g, "")) *
                            100,
                        )
                      : step === 3
                        ? "See document"
                        : "Not entered"}
                  </dd>
                </div>
              </dl>
              <p className="small-note">
                {step === 3
                  ? dirty
                    ? "Not yet saved"
                    : "Saved draft"
                  : "Changes are saved when you save the lease draft at review."}
              </p>
            </aside>
          </div>
        </>
      )}
      {!wordingOpen && (
        <section className="lease-saved">
          <h3>Saved leases</h3>
          {!drafts.length ? (
            <p className="management-empty">
              Your saved lease drafts will appear here.
            </p>
          ) : (
            drafts
              .filter((d) => !drafts.some((child) => child.parentId === d.id))
              .map((d) => (
                <article className="record" key={d.id}>
                  <div className="lease-saved-row">
                    <div>
                      <h4>{d.tenantName}</h4>
                      <p>
                        {
                          properties.find((p) => p.id === d.propertyId)?.data
                            .name
                        }{" "}
                        · Draft · {new Date(d.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="management-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openDraft(d)}
                      >
                        Open lease
                      </button>
                      <a
                        href={`/api/admin/leases/${d.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download PDF
                      </a>
                    </div>
                  </div>
                  {earlierVersions(d).length > 0 && (
                    <details>
                      <summary>
                        Earlier versions ({earlierVersions(d).length})
                      </summary>
                      {earlierVersions(d).map((v) => (
                        <div className="lease-history-row" key={v.id}>
                          <span>{new Date(v.createdAt).toLocaleString()}</span>
                          <button type="button" onClick={() => openDraft(v)}>
                            Open earlier version
                          </button>
                          <a
                            href={`/api/admin/leases/${v.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF
                          </a>
                        </div>
                      ))}
                    </details>
                  )}
                </article>
              ))
          )}
        </section>
      )}
    </section>
  );
}
