// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/management/section-card";
import { Button } from "@/components/ui/button";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { AppSelect } from "@/components/ui/select";
import { sourceDisclosures } from "@/lib/leases/disclosures";
import { type LeaseNode, textDocument } from "@/lib/leases/document";
import {
  fieldLabel,
  initialLeaseValues,
  type LeaseField,
  leaseFormValues,
  leaseSteps,
  missingLeaseDetails,
  moneyFields,
  normalizedLeaseValues,
  questionsFor,
} from "@/lib/management/lease-workflow";
import {
  generateLease,
  type LeaseValues,
  templateFields,
} from "@/lib/management/leases";
import { dollars } from "@/lib/management/model";
import { requireValue } from "@/lib/required";
import { disclosureDefaults, LeaseDisclosures } from "./lease-disclosures";
import { LeaseSigning } from "./lease-signing";
import { RemoveButton } from "./remove-button";

const LeaseDocumentPreview = dynamic(
  () => import("./lease-text-editor").then((m) => m.LeaseDocumentPreview),
  { ssr: false }
);
const LeaseTextEditor = dynamic(
  () => import("./lease-text-editor").then((m) => m.LeaseTextEditor),
  { loading: () => <p>Loading editor…</p>, ssr: false }
);
const LeasePdfPreview = dynamic(
  () => import("./lease-pdf-preview").then((m) => m.LeasePdfPreview),
  { loading: () => <p role="status">Loading PDF viewer…</p>, ssr: false }
);
const LeaseWordingEditor = dynamic(
  () => import("./lease-wording-editor").then((m) => m.LeaseWordingEditor),
  { loading: () => <p role="status">Loading document editor…</p>, ssr: false }
);

import type {
  DraftRecord,
  PropertyRecord,
  Save,
  TemplateRecord,
} from "./dashboard";

interface Applicant {
  email?: string;
  id: string;
  name: string;
  propertyId: string;
}
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
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export function LeaseWorkspace({
  properties,
  templates,
  drafts,
  applicants = [],
  save,
  busy,
  onRemoved,
}: {
  properties: PropertyRecord[];
  templates: TemplateRecord[];
  drafts: DraftRecord[];
  applicants?: Applicant[];
  save: Save;
  busy: boolean;
  onRemoved: () => Promise<void>;
}) {
  const preferred =
    templates.find((t) => t.id === "91268531-0000-4000-8000-000000000001") ??
    templates[0];
  const [propertyId, setPropertyId] = useState(
      properties.length === 1 ? properties[0].id : ""
    ),
    [templateId, setTemplateId] = useState(preferred?.id ?? ""),
    [values, setValues] = useState<LeaseValues>(() => ({
      ...initialLeaseValues(
        properties.length === 1 ? properties[0].data : undefined
      ),
      ...(properties.length === 1
        ? sourceDisclosures(properties[0].data.address)
        : {}),
      ...(properties.length === 1 ? properties[0].leaseDefaults : {}),
    })),
    [step, setStep] = useState(0),
    [furthest, setFurthest] = useState(0),
    [body, setBody] = useState(""),
    [leaseDocument, setDocument] = useState<LeaseNode | null>(null),
    [documentEditorKey, setDocumentEditorKey] = useState(0),
    [disclosuresReviewed, setDisclosuresReviewed] = useState(false),
    [disclosureMessage, setDisclosureMessage] = useState(""),
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
    [applicantId, setApplicantId] = useState(""),
    [editorOpen, setEditorOpen] = useState(false),
    [sideTab, setSideTab] = useState<"details" | "signing">("details"),
    [previewOpen, setPreviewOpen] = useState(false),
    [previewRevision, setPreviewRevision] = useState(0),
    [removing, setRemoving] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId),
    property = properties.find((p) => p.id === propertyId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (
      !parentId &&
      templateId &&
      !templates.some((t) => t.id === templateId)
    ) {
      setTemplateId(preferred?.id ?? "");
      setWordingOpen(false);
      setWordingDirty(false);
    }
    if (
      !parentId &&
      propertyId &&
      !properties.some((p) => p.id === propertyId)
    ) {
      setPropertyId("");
      setValues({});
      setDirty(false);
      setParentId(null);
      setSavedId("");
      setBody("");
      setStep(0);
      setFurthest(0);
    }
  }, [templates, properties, templateId, propertyId, preferred?.id, parentId]);
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
        !(
          /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
            "Leave without saving your lease changes?"
          )
        )
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("owner-sign-out", signOut);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("owner-sign-out", signOut);
    };
  }, [dirty, wordingDirty]);
  function go(nextLocal: number) {
    setStep(nextLocal);
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
      !(
        /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
          "Start a new lease without saving these changes?"
        )
      )
    ) {
      return;
    }
    setWordingOpen(false);
    setWordingDirty(false);
    setValues({
      ...initialLeaseValues(property?.data),
      ...sourceDisclosures(property?.data.address ?? ""),
      ...property?.leaseDefaults,
    });
    setDisclosuresReviewed(false);
    setDisclosureMessage("");
    setDocument(null);
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
    setEditorOpen(true);
    setSideTab("details");
    setPreviewOpen(false);
    go(0);
  }
  /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
  function next() {
    setError("");
    if (!(property && template)) {
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
      if (questionsFor(template.body, 2).length && !disclosuresReviewed) {
        throw new Error("Review the prefilled disclosures before continuing.");
      }
      const normalized = normalizedLeaseValues({
        ...values,
        property_address: property.data.address,
        property_name: property.data.name,
      });
      const missing = missingLeaseDetails(template.body, normalized);
      if (missing.length) {
        throw new Error(`Complete these lease details: ${missing.join(", ")}.`);
      }
      if (
        bodyEdited &&
        !(
          /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
            "Rebuild the lease from these details? Changes made directly to the document will be replaced."
          )
        )
      ) {
        return;
      }
      const generated = generateLease(template.body, normalized);
      if (generated.length > 45_000) {
        throw new Error(
          "This lease is too long to save. Shorten the added details and try again."
        );
      }
      setDocumentEditorKey((n) => n + 1);
      setBody(generated);
      setDocument(textDocument(generated));
      setBodyEdited(false);
      setTenantName(normalized.tenant_names?.trim() ?? "");
      setDirty(true);
      setSavedId("");
      setEditingDocument(true);
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
        "The document still has an unfilled detail. Return to the lease questions before saving."
      );
      return;
    }
    if (!body.trim()) {
      setError("The lease document cannot be empty.");
      return;
    }
    const ok = await save({
      action: "leaseDraft",
      body,
      document: leaseDocument ?? textDocument(body),
      id: draftId,
      parentId,
      propertyId,
      templateId,
      tenantName,
      values: normalizedLeaseValues(values),
    });
    if (ok) {
      setParentId(draftId);
      setSavedId(draftId);
      setDraftId(crypto.randomUUID());
      setDirty(false);
      setPreviewRevision((n) => n + 1);
    }
  }
  function earlierVersions(d: DraftRecord) {
    const versions: DraftRecord[] = [],
      seen = new Set([d.id]);
    let parent = d.parentId;
    while (parent && !seen.has(parent)) {
      const previous = drafts.find((v) => v.id === parent);
      if (!previous) {
        break;
      }
      versions.push(previous);
      seen.add(previous.id);
      parent = previous.parentId;
    }
    return versions;
  }
  function openDraft(d: DraftRecord) {
    if (
      dirty &&
      !(
        /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
          "Open this saved lease without saving your current changes?"
        )
      )
    ) {
      return;
    }
    setPropertyId(d.propertyId);
    setTemplateId(d.templateId);
    setTenantName(d.tenantName);
    setParentId(d.id);
    setDocumentEditorKey((n) => n + 1);
    setBody(d.body);
    setDocument(d.document ?? textDocument(d.body));
    setDisclosuresReviewed(false);
    setValues(leaseFormValues(d.values ?? {}));
    let manuallyEdited = true;
    try {
      const source = templates.find((t) => t.id === d.templateId);
      if (source && d.values) {
        manuallyEdited = generateLease(source.body, d.values) !== d.body;
      }
    } catch {
      /* Best-effort fallback: retain the original result when this optional operation fails. */
    }
    setBodyEdited(manuallyEdited);
    setSavedId(d.id);
    setDraftId(crypto.randomUUID());
    setDirty(false);
    setFurthest(3);
    setEditingDocument(true);
    setEditorOpen(true);
    setSideTab("details");
    setPreviewOpen(false);
    go(3);
  }
  function closeEditor() {
    if (
      dirty &&
      !(
        /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
          "Leave this lease without saving your changes?"
        )
      )
    ) {
      return;
    }
    setEditorOpen(false);
    setPreviewOpen(false);
    setDirty(false);
  }
  function downloadText() {
    const url = URL.createObjectURL(
      new Blob([`DRAFT — REVIEW BEFORE SIGNING\n\n${body}`], {
        type: "text/plain",
      })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "lease-draft.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  function openWording() {
    if (wordingOpen) {
      return;
    }
    setWordingSourceId(templateId);
    setWording(template?.body ?? "");
    setWordingName(
      template ? `${template.name} · revised` : "Back Acres lease"
    );
    setWordingDirty(false);
    setWordingOpen(true);
    setError("");
  }

  const resolveResult1 = () => {
    if (savedId && !dirty) {
      return "Draft saved";
    }
    if (parentId) {
      return "Save new version";
    }
    return "Save lease draft";
  };
  const resolveResult3 = () => {
    if (values.start_date && values.end_date) {
      return `${values.start_date} — ${values.end_date}`;
    }
    if (step === 3) {
      return "See document";
    }
    return "Not entered";
  };
  const resolveResult4 = () => {
    if (values.monthly_rent) {
      return dollars(Number(values.monthly_rent.replace(/[$,]/g, "")) * 100);
    }
    if (step === 3) {
      return "See document";
    }
    return "Not entered";
  };
  const resolveResult5 = () => {
    if (step === 3) {
      if (dirty) {
        return "Not yet saved";
      }
      return "Saved draft";
    }
    return "Changes are saved when you save the lease draft at review.";
  };
  const latestDrafts = drafts.filter(
    (d) => !drafts.some((child) => child.parentId === d.id)
  );
  const tenantEmailFor = (d: DraftRecord) =>
    applicants.find(
      (a) => a.propertyId === d.propertyId && a.name === d.tenantName
    )?.email ?? "";
  const resetRemoved = (d: DraftRecord) => {
    // Only reset if the removed lease is open in the editor.
    const family = [d.id, ...earlierVersions(d).map((v) => v.id)];
    if (family.includes(savedId) || (parentId && family.includes(parentId))) {
      setParentId(null);
      setSavedId("");
      setBody("");
      setBodyEdited(false);
      setValues({
        ...initialLeaseValues(property?.data),
        ...sourceDisclosures(property?.data.address ?? ""),
        ...property?.leaseDefaults,
      });
      setDisclosuresReviewed(false);
      setDisclosureMessage("");
      setDocument(null);
      setTenantName("");
      setDirty(false);
      setStep(0);
      setFurthest(0);
      setDraftId(crypto.randomUUID());
      setEditorOpen(false);
    }
  };
  const saved = !!savedId && !dirty;
  const summary = (
    <>
      <h3>{property?.data.name || "Choose a property"}</h3>
      {!!property && <p>{property.data.address}</p>}
      <dl>
        <div>
          <dt>Tenant</dt>
          <dd>{values.tenant_names || tenantName || "Not entered"}</dd>
        </div>
        <div>
          <dt>Lease dates</dt>
          <dd>{resolveResult3()}</dd>
        </div>
        <div>
          <dt>Monthly rent</dt>
          <dd>{resolveResult4()}</dd>
        </div>
      </dl>
    </>
  );
  const listView = (
    <>
      <div className="card-header">
        <h2>Leases</h2>
        <p>Open a saved lease to edit, preview, or send it for signature.</p>
        <Button
          disabled={busy || wordingOpen}
          onClick={startNew}
          type="button"
          variant="primary"
        >
          New lease
        </Button>
      </div>

      <div className="lease-tabs">
        <Button
          aria-pressed={!wordingOpen}
          disabled={busy}
          onClick={() => {
            if (
              !wordingDirty ||
              /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
                "Close without saving the wording changes?"
              )
            ) {
              setWordingOpen(false);
              setWordingDirty(false);
            }
          }}
          type="button"
          variant="quiet"
        >
          Saved leases
        </Button>
        <Button
          aria-pressed={wordingOpen}
          disabled={busy}
          onClick={openWording}
          type="button"
          variant="quiet"
        >
          Lease wording
        </Button>
      </div>
      {wordingOpen ? (
        <section
          aria-label="Edit lease wording"
          className="lease-wording-panel"
        >
          <h3>Lease wording</h3>
          <p>
            Make a separate copy when you need to change the document. Existing
            leases keep their original wording.
          </p>
          {!!(templates.length > 0) && (
            <AppSelect
              disabled={busy}
              label="Start from"
              onValueChange={(id) => {
                if (
                  wordingDirty &&
                  !(
                    /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
                      "Replace the wording changes you haven’t saved?"
                    )
                  )
                ) {
                  return;
                }
                const t = requireValue(
                  templates.find((tLocal) => tLocal.id === id),
                  "Expected templates.find((t) => t.id === id)"
                );
                setWordingSourceId(id);
                setWording(t.body);
                setWordingName(`${t.name} · revised`);
                setWordingDirty(false);
              }}
              value={wordingSourceId}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </AppSelect>
          )}
          {!!wordingSourceId && (
            <div className="management-actions">
              <RemoveButton
                disabled={busy}
                id={wordingSourceId}
                kind="leaseTemplate"
                name={
                  templates.find((t) => t.id === wordingSourceId)?.name ??
                  "Lease document"
                }
                onRemoved={async () => {
                  setWordingOpen(false);
                  setWordingDirty(false);
                  await onRemoved();
                }}
              />
            </div>
          )}
          <label className="field">
            Document name
            <input
              disabled={busy}
              maxLength={300}
              onChange={(e) => {
                setWordingName(e.target.value);
                setWordingDirty(true);
              }}
              value={wordingName}
            />
          </label>
          <LeaseWordingEditor
            body={wording}
            disabled={busy}
            key={wordingSourceId}
            onChange={(value) => {
              setWording(value);
              setWordingDirty(true);
            }}
          />
          <div className="management-actions">
            <Button
              className="submit-button"
              disabled={
                busy ||
                !wordingName.trim() ||
                !wording.trim() ||
                wording.length > 45_000
              }
              onClick={async () => {
                const id = crypto.randomUUID();
                const ok = await save({
                  action: "leaseTemplate",
                  body: wording,
                  id,
                  name: wordingName.trim(),
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
                  setEditorOpen(true);
                  go(0);
                }
              }}
              type="button"
            >
              Save as a new document
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (
                  !wordingDirty ||
                  /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
                    "Close without saving the wording changes?"
                  )
                ) {
                  setWordingOpen(false);
                  setWordingDirty(false);
                }
              }}
              type="button"
            >
              Back to lease
            </Button>
          </div>
        </section>
      ) : (
        <section aria-label="Saved leases" className="lease-saved">
          {latestDrafts.length ? (
            latestDrafts.map((d) => {
              const earlier = earlierVersions(d);
              return (
                <article className="record lease-record" key={d.id}>
                  <LeaseSigning
                    draftId={d.id}
                    heading={
                      <div className="lease-row-heading">
                        <h4>{d.tenantName}</h4>
                        <p>
                          {
                            properties.find((p) => p.id === d.propertyId)?.data
                              .name
                          }{" "}
                          · Saved {new Date(d.createdAt).toLocaleDateString()}
                          {earlier.length
                            ? ` · Version ${earlier.length + 1}`
                            : ""}
                        </p>
                      </div>
                    }
                    landlordEmail={d.values?.landlord_email ?? ""}
                    landlordName={d.values?.landlord_name ?? ""}
                    leading={
                      <Button
                        disabled={busy}
                        onClick={() => openDraft(d)}
                        type="button"
                      >
                        Open lease
                      </Button>
                    }
                    menuActions={[
                      {
                        label: "Remove lease",
                        onAction: () => setRemoving(d.id),
                        tone: "danger",
                      },
                    ]}
                    tenantEmail={tenantEmailFor(d)}
                    tenantName={d.tenantName}
                  />
                  <RemoveButton
                    disabled={busy}
                    id={d.id}
                    kind="leaseDraft"
                    name={d.tenantName}
                    onOpenChange={(open) => setRemoving(open ? d.id : null)}
                    onRemoved={async () => {
                      resetRemoved(d);
                      await onRemoved();
                    }}
                    open={removing === d.id}
                  />
                  {!!earlier.length && (
                    <details className="lease-versions">
                      <summary>Earlier versions ({earlier.length})</summary>
                      {earlier.map((v) => (
                        <div className="lease-history-row" key={v.id}>
                          <LeaseSigning
                            draftId={v.id}
                            heading={
                              <span className="lease-row-heading">
                                {new Date(v.createdAt).toLocaleString()}
                              </span>
                            }
                            landlordEmail={v.values?.landlord_email ?? ""}
                            landlordName={v.values?.landlord_name ?? ""}
                            leading={
                              <Button
                                onClick={() => openDraft(v)}
                                type="button"
                              >
                                Open earlier version
                              </Button>
                            }
                            tenantEmail={tenantEmailFor(v)}
                            tenantName={v.tenantName}
                          />
                        </div>
                      ))}
                    </details>
                  )}
                </article>
              );
            })
          ) : (
            <div className="management-empty lease-empty">
              <p>No saved leases yet.</p>
              <p className="small-note">
                Choose New lease to prepare one from your rental details.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
  const editorBar = (
    <header className="lease-editor-bar">
      <Button
        aria-label="Back to all leases"
        disabled={busy}
        onClick={closeEditor}
        type="button"
        variant="quiet"
      >
        ← Leases
      </Button>
      <div className="lease-editor-title">
        <h2>
          {step === 3
            ? `Lease for ${tenantName || values.tenant_names || "tenant"}`
            : "Prepare a lease"}
        </h2>
        <p>
          {property?.data.name ?? "No property chosen"}
          {step === 3 && (
            <>
              {" · "}
              <span
                className={
                  saved ? "lease-save-state" : "lease-save-state is-unsaved"
                }
                role="status"
              >
                {saved ? "All changes saved" : "Unsaved changes"}
              </span>
            </>
          )}
        </p>
      </div>
      {step === 3 && (
        <div className="lease-editor-actions">
          <Button
            aria-expanded={previewOpen}
            disabled={busy || !saved}
            onClick={() => setPreviewOpen((v) => !v)}
            title={saved ? undefined : "Save the draft to preview its PDF."}
            type="button"
            variant="quiet"
          >
            {previewOpen ? "Hide PDF preview" : "Preview PDF"}
          </Button>
          <OverflowMenu
            actions={[
              { label: "Download text", onAction: downloadText },
              ...(saved
                ? [
                    {
                      href: `/api/admin/leases/${savedId}/pdf?preview=1`,
                      label: "Download PDF",
                    },
                  ]
                : []),
            ]}
            disabled={busy}
            label="More lease actions"
          />
          {saved ? (
            <Button
              disabled={busy}
              onClick={() => setSideTab("signing")}
              type="button"
              variant="primary"
            >
              Send lease
            </Button>
          ) : (
            <Button
              className="submit-button"
              disabled={busy}
              onClick={saveDraft}
              type="button"
              variant="primary"
            >
              {resolveResult1()}
            </Button>
          )}
        </div>
      )}
    </header>
  );
  const questions = (
    <>
      <ol aria-label="Lease progress" className="lease-progress">
        {leaseSteps.slice(0, 3).map((label, i) => (
          <li aria-current={step === i ? "step" : undefined} key={label}>
            <Button
              disabled={busy || i > furthest}
              onClick={() => go(i)}
              type="button"
            >
              <span>{i + 1}</span>
              {label}
            </Button>
          </li>
        ))}
      </ol>
      <div className="lease-flow">
        <div className="lease-questions">
          <h3 className="lease-step-heading" ref={heading} tabIndex={-1}>
            {leaseSteps[step]}
          </h3>
          <form
            className="management-form lease-form"
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            <fieldset disabled={busy}>
              {!!(step === 0) && (
                <>
                  <AppSelect
                    label="Property"
                    name="leasePropertyId"
                    onValueChange={(id) => {
                      const p = requireValue(
                        properties.find((pLocal) => pLocal.id === id),
                        "Expected properties.find((p) => p.id === id)"
                      );
                      setPropertyId(id);
                      setParentId(null);
                      setDraftId(crypto.randomUUID());
                      setValues({
                        ...initialLeaseValues(p.data),
                        ...sourceDisclosures(p.data.address),
                        ...p.leaseDefaults,
                        tenant_names: "",
                      });
                      setDisclosuresReviewed(false);
                      setDisclosureMessage("");
                      setDocument(null);
                      setApplicantId("");
                      setDirty(true);
                      setSavedId("");
                    }}
                    required
                    value={propertyId}
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
                      onValueChange={(id) => {
                        setTemplateId(id);
                        setParentId(null);
                        setDraftId(crypto.randomUUID());
                        setDirty(true);
                        setFurthest(0);
                      }}
                      required
                      value={templateId}
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </AppSelect>
                  ) : (
                    <p className="small-note">
                      Based on your supplied lease. Use Lease wording only when
                      you need to change its text.
                    </p>
                  )}
                  {!templates.length && (
                    <p className="management-empty">
                      Add your lease document using Lease wording to begin.
                    </p>
                  )}
                  {!!applicants.some((a) => a.propertyId === propertyId) && (
                    <AppSelect
                      label="Fill tenant from an application"
                      onValueChange={(id) => {
                        setApplicantId(id);
                        const applicant = applicants.find((a) => a.id === id);
                        if (applicant) {
                          change("tenant_names", applicant.name);
                        }
                      }}
                      value={applicantId}
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
              {!!(step === 1) && (
                <p className="small-note">
                  Monthly rent comes from the property. Check every amount;
                  enter 0 where no fee applies.
                </p>
              )}
              {!!(
                step === 2 && questionsFor(template?.body ?? "", 2).length > 0
              ) && (
                <>
                  <LeaseDisclosures
                    busy={busy}
                    fields={questionsFor(template?.body ?? "", 2)}
                    fromSource={
                      !!sourceDisclosures(property?.data.address ?? "")
                        .habitability_disclosure
                    }
                    hasDefaults={
                      !!property?.leaseDefaults &&
                      Object.keys(property.leaseDefaults).length > 0
                    }
                    onChange={(key, value) => {
                      change(key, value);
                      setDisclosuresReviewed(false);
                      setDisclosureMessage("");
                    }}
                    onClearDefaults={async () => {
                      if (
                        await save({
                          action: "leaseDefaults",
                          propertyId,
                          values: {},
                        })
                      ) {
                        setDisclosureMessage(
                          "Saved defaults cleared. This lease’s wording is unchanged."
                        );
                      }
                    }}
                    onReviewed={setDisclosuresReviewed}
                    onSaveDefaults={async () => {
                      if (
                        await save({
                          action: "leaseDefaults",
                          propertyId,
                          values: disclosureDefaults(values),
                        })
                      ) {
                        setDisclosureMessage(
                          "Saved. New leases for this property will use these disclosures."
                        );
                      }
                    }}
                    reviewed={disclosuresReviewed}
                    values={values}
                  />
                  {!!disclosureMessage && (
                    <p role="status">{disclosureMessage}</p>
                  )}
                </>
              )}
              <div className="fields lease-fields">
                {(step === 2
                  ? []
                  : questionsFor(template?.body ?? "", step)
                ).map(
                  /* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
                  (key) => {
                    const resolveType2 = () => {
                      if (key.endsWith("_date")) {
                        return "date";
                      }
                      if (moneyFields.includes(key) || key === "rent_due_day") {
                        return "number";
                      }
                      if (key === "landlord_email") {
                        return "email";
                      }
                      if (key === "landlord_phone") {
                        return "tel";
                      }
                      return "text";
                    };
                    return (
                      <label
                        className={[
                          "field",
                          longAnswers.includes(key) ? "lease-wide" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        htmlFor={`lease-field-${key}`}
                        key={key}
                      >
                        {fieldLabel(key)}
                        {moneyFields.includes(key) ? " ($)" : ""}
                        {longAnswers.includes(key) ? (
                          <textarea
                            aria-label={fieldLabel(key)}
                            id={`lease-field-${key}`}
                            maxLength={key === "tenant_names" ? 300 : 3000}
                            name={key}
                            onChange={(e) => change(key, e.target.value)}
                            required
                            rows={key === "tenant_names" ? 2 : 3}
                            value={values[key] ?? ""}
                          />
                        ) : (
                          <input
                            id={`lease-field-${key}`}
                            name={key}
                            onChange={(e) => change(key, e.target.value)}
                            required
                            type={resolveType2()}
                            value={values[key] ?? ""}
                            {...(moneyFields.includes(key)
                              ? { max: 100_000, min: 0, step: "0.01" }
                              : {})}
                            {...(key === "rent_due_day"
                              ? { max: 28, min: 1, step: 1 }
                              : {})}
                            maxLength={3000}
                          />
                        )}
                        {!!(key === "tenant_names") && (
                          <span className="small-note">
                            One adult tenant per line.
                          </span>
                        )}
                      </label>
                    );
                  }
                )}
              </div>
              {!!(
                step === 2 && questionsFor(template?.body ?? "", 2).length === 0
              ) && <p>This document has no additional disclosure questions.</p>}
              <div className="lease-step-actions">
                {!!(step > 0) && (
                  <Button onClick={() => go(step - 1)} type="button">
                    Back
                  </Button>
                )}
                <Button
                  className="submit-button"
                  disabled={!(template && properties.length)}
                  type="submit"
                  variant="primary"
                >
                  {step === 2 ? "Review lease" : "Continue"}
                </Button>
              </div>
            </fieldset>
          </form>
          {!!error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside aria-label="Lease summary" className="lease-summary">
          <p className="eyebrow">Your lease</p>
          {summary}
          <p className="small-note">{resolveResult5()}</p>
        </aside>
      </div>
    </>
  );
  const documentView = (
    <>
      {!!(previewOpen && saved) && (
        <LeasePdfPreview
          draftId={savedId}
          onClose={() => setPreviewOpen(false)}
          revision={previewRevision}
        />
      )}
      {!!error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="lease-document-layout">
        <div className="lease-document-column">
          <h3
            className="lease-step-heading visually-hidden"
            ref={heading}
            tabIndex={-1}
          >
            {leaseSteps[3]}
          </h3>
          <fieldset className="lease-document-modes">
            <legend className="visually-hidden">Document view</legend>
            <Button
              aria-label="Edit document text"
              aria-pressed={editingDocument}
              onClick={() => setEditingDocument(true)}
              type="button"
              variant="quiet"
            >
              Edit
            </Button>
            <Button
              aria-label="Read document"
              aria-pressed={!editingDocument}
              onClick={() => setEditingDocument(false)}
              type="button"
              variant="quiet"
            >
              Read
            </Button>
          </fieldset>
          {editingDocument ? (
            <LeaseTextEditor
              body={body}
              disabled={busy}
              document={leaseDocument}
              key={documentEditorKey}
              label="Lease document text"
              onChange={(text, content) => {
                setBody(text);
                setDocument(content);
                setBodyEdited(true);
                setDirty(true);
              }}
            />
          ) : (
            <LeaseDocumentPreview
              document={leaseDocument ?? textDocument(body)}
            />
          )}
        </div>
        <aside aria-label="Lease panel" className="lease-side-panel">
          <div className="lease-side-tabs">
            <Button
              aria-pressed={sideTab === "details"}
              onClick={() => setSideTab("details")}
              type="button"
              variant="quiet"
            >
              Details
            </Button>
            <Button
              aria-pressed={sideTab === "signing"}
              onClick={() => setSideTab("signing")}
              type="button"
              variant="quiet"
            >
              Signing
            </Button>
          </div>
          {sideTab === "details" ? (
            <div className="lease-side-body lease-summary">
              {summary}
              {!!values.tenant_names && (
                <Button onClick={() => go(0)} type="button">
                  Edit lease details
                </Button>
              )}
              <h4>Before signing</h4>
              <p className="small-note">
                Check the late-fee summary against the late-fee clause,
                statutory notices, animal accommodations, liability terms, and
                required attachments. The supplied PDF listed enclosures but did
                not include them. Signing starts only after you save and send
                the lease.
              </p>
            </div>
          ) : (
            <div className="lease-side-body">
              {saved ? (
                <LeaseSigning
                  draftId={savedId}
                  embedded
                  key={savedId}
                  landlordEmail={values.landlord_email ?? ""}
                  landlordName={values.landlord_name ?? ""}
                  tenantEmail={
                    applicants.find(
                      (a) =>
                        a.propertyId === propertyId && a.name === tenantName
                    )?.email ?? ""
                  }
                  tenantName={tenantName}
                />
              ) : (
                <p className="small-note">
                  Save the draft first. Then you can send it to each signer.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
  return (
    <SectionCard label="Editor">
      {editorOpen ? (
        <div className="lease-editor">
          {editorBar}
          {step === 3 && documentView}
          {step !== 3 && questions}
        </div>
      ) : (
        listView
      )}
    </SectionCard>
  );
}
