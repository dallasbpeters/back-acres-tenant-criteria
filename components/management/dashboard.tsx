// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import {
  type ApplicationInput,
  applicationStatuses,
  dollars,
  maintenanceStatuses,
  type PropertyInput,
} from "@/lib/management/model";
import { AmenityPicker } from "./amenities";
import { BillingWorkspace, type RentScheduleRecord } from "./billing";
import { BrandingWorkspace } from "./branding";
import { LeaseWorkspace } from "./leases";
import { ownerSections } from "./navigation";
import { PaymentRentersProvider, RentersOverview } from "./payment-renters";
import { PaymentRequests } from "./payment-requests";
import type { PhotoRecord } from "./photos";
import { type PublicationRecord, PublishingWorkspace } from "./publishing";
import {
  RemoveButton,
  type RemovedRecord,
  RemovedWorkspace,
} from "./remove-button";
import { ScreeningPanel } from "./screening-panel";
export interface PropertyRecord {
  data: PropertyInput;
  id: string;
  leaseDefaults?: import("@/lib/management/leases").LeaseValues | null;
  publishingDigest: string;
  revision: number;
  slug: string;
}
interface ApplicationRecord {
  createdAt: string;
  criteriaSnapshot: string;
  criteriaVersion: string;
  data: ApplicationInput;
  id: string;
  propertyId: string;
  status: string;
}
interface MaintenanceRecord {
  createdAt: string;
  data: {
    name: string;
    email: string;
    phone: string;
    subject: string;
    description: string;
    priority: string;
    accessNotes: string;
  };
  id: string;
  propertyId: string;
  status: string;
}
interface LinkRecord {
  expiresAt: string;
  id: string;
  propertyId: string;
  residentName: string;
  revoked: boolean;
  url: string;
}
export interface InvoiceRecord {
  amountCents: number;
  category?: string;
  description: string;
  dueDate: string;
  id: string;
  mode: string;
  payerEmail: string;
  payerName: string;
  propertyId: string;
  status: string;
  url: string;
}
export interface TemplateRecord {
  body: string;
  createdAt: string;
  id: string;
  name: string;
}
export interface DraftRecord {
  body: string;
  createdAt: string;
  document?: import("@/lib/leases/document").LeaseNode | null;
  id: string;
  parentId: string | null;
  propertyId: string;
  templateId: string;
  tenantName: string;
  values: import("@/lib/management/leases").LeaseValues | null;
}
interface Records {
  applications: ApplicationRecord[];
  drafts: DraftRecord[];
  invoices: InvoiceRecord[];
  maintenance: MaintenanceRecord[];
  paymentKeyKind?: string;
  paymentMode: string;
  paymentsReady: boolean;
  photos: PhotoRecord[];
  properties: PropertyRecord[];
  publications: PublicationRecord[];
  removed: RemovedRecord[];
  rentSchedules: RentScheduleRecord[];
  residentLinks: LinkRecord[];
  templates: TemplateRecord[];
}
export async function command(body: unknown) {
  const r = await fetch("/api/admin/management", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const result = await r.json();
  if (!r.ok) {
    throw new Error(result.error);
  }
  return result;
}
export function Dashboard() {
  const [records, setRecords] = useState<Records | null>(null),
    [tab, setTab] = useState("Properties"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/management", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) {
      throw new Error(data.error);
    }
    setRecords(data);
  }, []);

  useEffect(() => {
    const changeSection = () => {
      const selected = ownerSections.find(
        (s) => s.key === window.location.hash.slice(1)
      );
      setTab(selected?.name ?? "Properties");
      setMessage("");
    };
    changeSection();
    window.addEventListener("hashchange", changeSection);
    load().catch((e) => setError(e.message));
    return () => window.removeEventListener("hashchange", changeSection);
  }, [load]);
  async function save(body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await command(body);
      await load();
      setMessage("Saved.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const propertyName = (id: string) =>
    records?.properties.find((p) => p.id === id)?.data.name ??
    records?.removed.find((r) => r.entityId === id && r.kind === "property")
      ?.label ??
    "Property";

  return (
    <>
      {!!error && (
        <p role="alert">
          {error}{" "}
          <Button
            onClick={() => load().catch((e) => setError(e.message))}
            type="submit"
          >
            Reload records
          </Button>
        </p>
      )}
      {!!message && <p role="status">{message}</p>}
      {records ? (
        <>
          {!!(tab === "Branding") && <BrandingWorkspace />}
          {!!(tab === "Removed") && (
            <RemovedWorkspace onSaved={load} records={records.removed} />
          )}
          {!!(tab === "Properties") && (
            <PropertyWorkspace
              busy={busy}
              onRemoved={load}
              properties={records.properties}
              save={save}
            />
          )}
          {!!(tab === "Publishing") && (
            <PublishingWorkspace
              onSaved={load}
              photos={records.photos}
              properties={records.properties}
              publications={records.publications}
            />
          )}
          {!!(tab === "Applications") && (
            <section>
              <h2>Applications</h2>
              <p>
                Submitted information is applicant-reported and email addresses
                are unverified. Review each application yourself; status changes
                do not send decisions.
              </p>
              <p className="small-note">
                Screening runs through TransUnion SmartMove. Each application
                shows its next step.
              </p>
              {!records.applications.length && (
                <p className="management-empty">
                  New applications will appear here after a published property
                  accepts submissions.
                </p>
              )}
              {records.applications.map((a) => (
                <details className="record" key={a.id}>
                  <summary>
                    {a.data.name} · {propertyName(a.propertyId)} ·{" "}
                    {a.status.replaceAll("_", " ")}
                  </summary>
                  <p>
                    Received {new Date(a.createdAt).toLocaleString()} ·{" "}
                    {a.data.email} · {a.data.phone}
                  </p>
                  <dl>
                    <dt>Current address</dt>
                    <dd>{a.data.currentAddress}</dd>
                    <dt>Monthly income (self-reported)</dt>
                    <dd>{dollars(a.data.monthlyIncome * 100)}</dd>
                    <dt>Income details</dt>
                    <dd className="document-text">{a.data.incomeDetails}</dd>
                    <dt>Housing history</dt>
                    <dd className="document-text">{a.data.housingHistory}</dd>
                    <dt>Requested move-in / occupants</dt>
                    <dd>
                      {a.data.moveDate} / {a.data.occupants}
                    </dd>
                    <dt>Additional information</dt>
                    <dd>{a.data.notes || "None"}</dd>
                  </dl>
                  <details>
                    <summary>
                      Criteria acknowledged: {a.criteriaVersion}
                    </summary>
                    <p className="document-text">{a.criteriaSnapshot}</p>
                  </details>
                  <ScreeningPanel
                    applicant={a.data}
                    busy={busy}
                    onStatus={(status) =>
                      save({ action: "applicationStatus", id: a.id, status })
                    }
                    propertyAddress={
                      records.properties.find((p) => p.id === a.propertyId)
                        ?.data.address ?? ""
                    }
                    status={a.status}
                  />
                  <AppSelect
                    disabled={busy}
                    label={<>Status (change by hand)</>}
                    onValueChange={(value) =>
                      save({
                        action: "applicationStatus",
                        id: a.id,
                        status: value,
                      })
                    }
                    value={a.status}
                  >
                    {applicationStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </AppSelect>
                  <RemoveButton
                    disabled={busy}
                    id={a.id}
                    kind="application"
                    name={a.data.name}
                    onRemoved={load}
                  />
                </details>
              ))}
            </section>
          )}
          <div hidden={tab !== "Leases"}>
            <LeaseWorkspace
              applicants={records.applications.map((a) => ({
                email: a.data.email,
                id: a.id,
                name: a.data.name,
                propertyId: a.propertyId,
              }))}
              busy={busy}
              drafts={records.drafts}
              onRemoved={load}
              properties={records.properties}
              save={save}
              templates={records.templates}
            />
          </div>
          {!!(tab === "Payments") && (
            <PaymentRentersProvider>
              <section className="payments-tab">
                <header className="payments-head">
                  <div>
                    <h2>Payments</h2>
                    <p className="small-note">
                      Rent schedules collect monthly rent. Payment requests are
                      one-time charges, such as a deposit or a fee. Don’t
                      request the same charge twice.
                    </p>
                  </div>
                  <div className="payments-head-meta">
                    <span
                      className="payment-mode"
                      data-mode={
                        records.paymentsReady ? records.paymentMode : "off"
                      }
                    >
                      {paymentModeLabel(records)}
                    </span>
                    <a href="/admin/payment-history">Payment activity</a>
                  </div>
                </header>
                <RentersOverview propertyName={propertyName} />
                <BillingWorkspace
                  onSaved={load}
                  properties={records.properties}
                  ready={records.paymentsReady}
                  schedules={records.rentSchedules}
                />
                <PaymentRequests
                  busy={busy}
                  invoices={records.invoices}
                  onSaved={load}
                  properties={records.properties}
                  propertyName={propertyName}
                  save={save}
                />
              </section>
            </PaymentRentersProvider>
          )}
          {!!(tab === "Maintenance") && (
            <section>
              <h2>Maintenance</h2>
              <p>
                Tenants submit requests from the Maintenance page of their
                tenant portal. Connect a tenant&apos;s account to a property
                under Tenants; no request link is needed.
              </p>
              {records.residentLinks.length > 0 && (
                <details>
                  <summary>
                    Older request links ({records.residentLinks.length})
                  </summary>
                  <p className="small-note">
                    Links created before the tenant portal. They keep working
                    until they expire or you revoke them.
                  </p>
                  {records.residentLinks.map((l) => (
                    <article className="record" key={l.id}>
                      <h3>
                        {l.residentName} · {propertyName(l.propertyId)}
                      </h3>
                      <p>
                        {l.revoked
                          ? "Revoked"
                          : `Expires ${new Date(l.expiresAt).toLocaleDateString()}`}
                      </p>
                      <RemoveButton
                        disabled={busy}
                        id={l.id}
                        kind="residentLink"
                        name={l.residentName}
                        onRemoved={load}
                      />
                      {!l.revoked && (
                        <>
                          <CopyLink url={l.url} />
                          <div className="management-actions">
                            <a href={l.url} rel="noreferrer" target="_blank">
                              Open request form
                            </a>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                save({ action: "revokeLink", id: l.id })
                              }
                              type="submit"
                            >
                              Revoke link
                            </Button>
                          </div>
                        </>
                      )}
                    </article>
                  ))}
                </details>
              )}
              <h2>Requests</h2>
              {!records.maintenance.length && (
                <p className="management-empty">No maintenance requests yet.</p>
              )}
              {records.maintenance.map((m) => (
                <details className="record" key={m.id}>
                  <summary>
                    {m.data.subject} · {m.data.priority} · {m.status}
                  </summary>
                  <p>
                    {propertyName(m.propertyId)} · {m.data.name} ·{" "}
                    {m.data.email} · {m.data.phone}
                  </p>
                  <p>{new Date(m.createdAt).toLocaleString()}</p>
                  <p className="document-text">{m.data.description}</p>
                  <p>Access: {m.data.accessNotes || "Contact resident"}</p>
                  <AppSelect
                    disabled={busy}
                    label={<>Request status</>}
                    onValueChange={(value) =>
                      save({
                        action: "maintenanceStatus",
                        id: m.id,
                        status: value,
                      })
                    }
                    value={m.status}
                  >
                    {maintenanceStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </AppSelect>
                  <RemoveButton
                    disabled={busy}
                    id={m.id}
                    kind="maintenance"
                    name={m.data.subject}
                    onRemoved={load}
                  />
                </details>
              ))}
            </section>
          )}
          <p className="small-note">
            Workspace shows the latest 200 records per section.
          </p>
        </>
      ) : (
        <p>Loading property records…</p>
      )}
    </>
  );
}
export type Save = (body: unknown) => Promise<boolean>;
function paymentModeLabel(records: Records) {
  if (!records.paymentsReady) {
    return "Stripe not set up";
  }
  return records.paymentMode === "live"
    ? "Live · real money"
    : `Test mode · key ${records.paymentKeyKind ?? ""}`.trim();
}
export function Field({
  name,
  label,
  type = "text",
  value,
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        defaultValue={value}
        maxLength={500}
        min={type === "number" ? "0" : undefined}
        name={name}
        required={required}
        step={type === "number" ? "0.01" : undefined}
        type={type}
      />
    </label>
  );
}
export function PropertySelect({
  defaultValue,
  properties,
}: {
  defaultValue?: string;
  properties: PropertyRecord[];
}) {
  return (
    <AppSelect
      aria-label="Property"
      defaultValue={defaultValue}
      label={<>Property</>}
      name="propertyId"
      required
    >
      <option value="">Choose a property</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.data.name}
        </option>
      ))}
    </AppSelect>
  );
}
function CopyLink({ url }: { url: string }) {
  const [message, setMessage] = useState("");

  return (
    <div className="management-actions">
      <Button
        onClick={() =>
          navigator.clipboard
            .writeText(url)
            .then(() => setMessage("Copied."))
            .catch(() => setMessage("Copy the link below."))
        }
        type="button"
      >
        Copy private link
      </Button>
      <span role="status">{message}</span>
      {!!(message === "Copy the link below.") && (
        <input aria-label="Private link" readOnly value={url} />
      )}
    </div>
  );
}
function PropertyWorkspace({
  properties,
  save,
  busy,
  onRemoved,
}: {
  properties: PropertyRecord[];
  save: Save;
  busy: boolean;
  onRemoved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<PropertyRecord | null>(null),
    [open, setOpen] = useState(false);
  const data = editing?.data;

  return (
    <section>
      <div className="section-heading-row">
        <div>
          <h2>Properties</h2>
          <p className="small-note">
            Manage listings, availability, and applications.
          </p>
        </div>
        <div className="management-actions">
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            type="submit"
          >
            Add property
          </Button>
        </div>
      </div>
      {properties.map((p) => {
        const resolveResult1 = () => {
          if (p.data.acceptingApplications) {
            if (p.data.published) {
              return "Applications open";
            }
            return "Applications enabled after publishing";
          }
          return "Applications closed";
        };
        return (
          <article className="record" key={p.id}>
            <h3>{p.data.name}</h3>
            <p>
              {p.data.address} · {dollars(p.data.rentCents)} / month
            </p>
            <p>
              {p.data.published ? "Published" : "Draft"} · {resolveResult1()}
            </p>
            <div className="management-actions">
              <Button
                onClick={() => {
                  setEditing(p);
                  setOpen(true);
                }}
                type="submit"
              >
                Edit {p.data.name}
              </Button>
              <RemoveButton
                disabled={busy}
                id={p.id}
                kind="property"
                name={p.data.name}
                onRemoved={async () => {
                  if (editing?.id === p.id) {
                    setEditing(null);
                    setOpen(false);
                  }
                  await onRemoved();
                }}
              />
              <a href={`/admin?property=${p.id}#publishing`}>
                Photos & publishing
              </a>
              {!!p.data.published && (
                <a
                  href={`/properties/${p.slug}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View listing
                </a>
              )}
            </div>
          </article>
        );
      })}
      {!!open && (
        <form
          className="management-form"
          key={editing?.id ?? "new"}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const s = (key: string) => String(f.get(key) ?? "");
            const ok = await save({
              action: "property",
              data: {
                acceptingApplications: f.get("acceptingApplications") === "on",
                address: s("address"),
                amenities: f.getAll("amenities").map(String),
                availableDate: s("availableDate"),
                bathrooms: Number(s("bathrooms")),
                bedrooms: Number(s("bedrooms")),
                contact: s("contact"),
                description: s("description"),
                emergencyContact: data?.emergencyContact ?? "",
                name: s("name"),
                published: f.get("published") === "on",
                rentCents: Math.round(Number(s("rent")) * 100),
              },
              id: editing?.id ?? crypto.randomUUID(),
              revision: editing?.revision ?? 0,
            });
            if (ok) {
              setOpen(false);
            }
          }}
        >
          <h3>{editing ? "Edit property" : "New property"}</h3>
          <p>
            {editing
              ? `Listing link: /properties/${editing.slug}. This stays the same when you edit the property.`
              : "Your listing link is generated automatically from the property address when you save."}
          </p>
          <fieldset disabled={busy}>
            <div className="fields">
              <Field label="Property name" name="name" value={data?.name} />
              <Field
                label="Property address"
                name="address"
                value={data?.address}
              />
              <Field
                label="Monthly rent ($)"
                name="rent"
                type="number"
                value={data ? data.rentCents / 100 : undefined}
              />
              <Field
                label="Bedrooms"
                name="bedrooms"
                type="number"
                value={data?.bedrooms}
              />
              <Field
                label="Bathrooms"
                name="bathrooms"
                type="number"
                value={data?.bathrooms}
              />
              <Field
                label="Available date"
                name="availableDate"
                required={false}
                type="date"
                value={data?.availableDate}
              />
              <Field
                label="Public owner contact"
                name="contact"
                value={data?.contact}
              />
              <div className="field">
                <span>Urgent repairs</span>
                <a href="/admin#maintenance" rel="noreferrer" target="_blank">
                  Open maintenance portal
                </a>
                <small>Review tenant maintenance requests in a new tab.</small>
              </div>
            </div>
            <label className="field">
              Listing description
              <textarea
                defaultValue={data?.description}
                name="description"
                required
                rows={5}
              />
            </label>
            <AmenityPicker selected={data?.amenities} />
            <p>
              Selection criteria are managed centrally.{" "}
              <a href="/#criteria" rel="noreferrer" target="_blank">
                View selection criteria
              </a>
            </p>
            <p className="small-note">
              Save this property, then add its photos in Photos & publishing.
            </p>
            <label className="check-row">
              <input
                defaultChecked={data?.published}
                name="published"
                type="checkbox"
              />
              Publish this listing
            </label>
            <label className="check-row">
              <input
                defaultChecked={data?.acceptingApplications}
                name="acceptingApplications"
                type="checkbox"
              />
              Accept applications
            </label>
            <Button className="submit-button" type="submit" variant="primary">
              Save property
            </Button>
          </fieldset>
        </form>
      )}
      {!(properties.length || open) && (
        <p className="management-empty">
          Add your first property to start listing and accepting applications.
        </p>
      )}
    </section>
  );
}
