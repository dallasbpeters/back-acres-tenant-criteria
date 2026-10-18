"use client";
import { AmenityPicker } from "./amenities";
import { Button } from "@/components/ui/button";

import { BrandingWorkspace } from "./branding";
import {
  RemoveButton,
  RemovedWorkspace,
  type RemovedRecord,
} from "./remove-button";
import { AppSelect } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { ownerSections } from "./navigation";
import { PublishingWorkspace, type PublicationRecord } from "./publishing";
import type { PhotoRecord } from "./photos";
import {
  applicationStatuses,
  maintenanceStatuses,
  dollars,
  type PropertyInput,
  type ApplicationInput,
} from "@/lib/management/model";
import { POLICY, policyRecordText } from "@/lib/policy";
import { LeaseWorkspace } from "./leases";
import { BillingWorkspace, type RentScheduleRecord } from "./billing";
export type PropertyRecord = {
  leaseDefaults?: import("@/lib/management/leases").LeaseValues | null;
  id: string;
  slug: string;
  revision: number;
  publishingDigest: string;
  data: PropertyInput;
};
type ApplicationRecord = {
  id: string;
  propertyId: string;
  status: string;
  createdAt: string;
  data: ApplicationInput;
  criteriaVersion: string;
  criteriaSnapshot: string;
};
type MaintenanceRecord = {
  id: string;
  propertyId: string;
  status: string;
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
};
type LinkRecord = {
  id: string;
  propertyId: string;
  residentName: string;
  revoked: boolean;
  expiresAt: string;
  url: string;
};
type InvoiceRecord = {
  mode: string;
  id: string;
  propertyId: string;
  payerName: string;
  payerEmail: string;
  description: string;
  amountCents: number;
  status: string;
  dueDate: string;
  url: string;
};
export type TemplateRecord = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
};
export type DraftRecord = {
  document?: import("@/lib/leases/document").LeaseNode | null;
  values: import("@/lib/management/leases").LeaseValues | null;
  id: string;
  propertyId: string;
  templateId: string;
  parentId: string | null;
  tenantName: string;
  body: string;
  createdAt: string;
};
type Records = {
  removed: RemovedRecord[];
  photos: PhotoRecord[];
  publications: PublicationRecord[];
  rentSchedules: RentScheduleRecord[];
  properties: PropertyRecord[];
  applications: ApplicationRecord[];
  maintenance: MaintenanceRecord[];
  residentLinks: LinkRecord[];
  invoices: InvoiceRecord[];
  templates: TemplateRecord[];
  drafts: DraftRecord[];
  paymentsReady: boolean;
  paymentMode: string;
};
export async function command(body: unknown) {
  const r = await fetch("/api/admin/management", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error);
  return result;
}
export function Dashboard() {
  const [records, setRecords] = useState<Records | null>(null),
    [tab, setTab] = useState("Properties"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch("/api/admin/management", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setRecords(data);
  }
  useEffect(() => {
    const changeSection = () => {
      const selected = ownerSections.find(
        (s) => s.key === window.location.hash.slice(1),
      );
      setTab(selected?.name ?? "Properties");
      setMessage("");
    };
    changeSection();
    window.addEventListener("hashchange", changeSection);
    load().catch((e) => setError(e.message));
    return () => window.removeEventListener("hashchange", changeSection);
  }, []);
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
      {error && (
        <p role="alert">
          {error}{" "}
          <Button
            type="submit"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Reload records
          </Button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!records ? (
        <p>Loading property records…</p>
      ) : (
        <>
          {tab === "Branding" && <BrandingWorkspace />}
          {tab === "Removed" && (
            <RemovedWorkspace records={records.removed} onSaved={load} />
          )}
          {tab === "Properties" && (
            <PropertyWorkspace
              properties={records.properties}
              save={save}
              busy={busy}
              onRemoved={load}
            />
          )}
          {tab === "Publishing" && (
            <PublishingWorkspace
              properties={records.properties}
              photos={records.photos}
              publications={records.publications}
              onSaved={load}
            />
          )}
          {tab === "Applications" && (
            <section>
              <h2>Applications</h2>
              <p>
                Submitted information is applicant-reported and email addresses
                are unverified. Review each application yourself; status changes
                do not send decisions.
              </p>
              <p>
                <a
                  href="https://www.mysmartmove.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open SmartMove for screening
                </a>{" "}
                · Screening is arranged separately. Reports are not
                automatically imported.
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
                  <AppSelect
                    label={<>Application status</>}
                    value={a.status}
                    disabled={busy}
                    onValueChange={(value) =>
                      save({
                        action: "applicationStatus",
                        id: a.id,
                        status: value,
                      })
                    }
                  >
                    {applicationStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </AppSelect>
                  <RemoveButton
                    kind="application"
                    id={a.id}
                    name={a.data.name}
                    onRemoved={load}
                    disabled={busy}
                  />
                  <a href="/admin/adverse-actions">
                    Prepare a notice separately
                  </a>
                </details>
              ))}
            </section>
          )}
          <div hidden={tab !== "Leases"}>
            <LeaseWorkspace
              properties={records.properties}
              templates={records.templates}
              drafts={records.drafts}
              applicants={records.applications.map((a) => ({
                id: a.id,
                propertyId: a.propertyId,
                name: a.data.name,
                email: a.data.email,
              }))}
              save={save}
              busy={busy}
              onRemoved={load}
            />
          </div>
          {tab === "Payments" && (
            <section>
              <h2>Payment requests</h2>
              <p>
                {records.paymentsReady
                  ? `Stripe ${records.paymentMode} mode is configured.`
                  : "Stripe setup is pending. You can prepare requests; checkout remains unavailable."}{" "}
                Use a rent schedule for monthly invoices, or a separate request
                for a deposit, fee, or one-time rent charge. Avoid requesting
                the same obligation twice. Automatic ACH requires the tenant’s
                bank authorization.
              </p>
              <BillingWorkspace
                properties={records.properties}
                schedules={records.rentSchedules}
                onSaved={load}
                ready={records.paymentsReady}
              />
              <InvoiceForm
                properties={records.properties}
                save={save}
                busy={busy}
              />
              {records.invoices.map((i) => (
                <article className="record" key={i.id}>
                  <h3>
                    {i.description} · {dollars(i.amountCents)}
                  </h3>
                  <p>
                    {i.payerName} · {i.payerEmail} ·{" "}
                    {propertyName(i.propertyId)}
                  </p>
                  <p>
                    Due {i.dueDate} · {i.status} · {i.mode} mode
                  </p>
                  <a href={i.url} target="_blank" rel="noreferrer">
                    Open payment request
                  </a>
                  <CopyLink url={i.url} />
                  <RemoveButton
                    kind="invoice"
                    id={i.id}
                    name={i.description}
                    onRemoved={load}
                    disabled={busy}
                    cancelFirst={i.status === "open"}
                  />
                  {i.status === "open" && (
                    <div className="management-actions">
                      <Button
                        type="submit"
                        disabled={busy}
                        onClick={() =>
                          save({ action: "voidInvoice", id: i.id })
                        }
                      >
                        Cancel payment request
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}
          {tab === "Maintenance" && (
            <section>
              <h2>Maintenance</h2>
              <p>
                Create a private link for each resident. Anyone with the link
                can submit a request; it does not expose past requests. Links
                expire after one year and can be revoked.
              </p>
              <form
                className="management-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await save({
                    action: "residentLink",
                    propertyId: f.get("propertyId"),
                    residentName: f.get("residentName"),
                  });
                }}
              >
                <div className="fields">
                  <PropertySelect properties={records.properties} />
                  <Field name="residentName" label="Resident name" />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  className="submit-button"
                  disabled={busy || !records.properties.length}
                >
                  Create resident link
                </Button>
              </form>
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
                    kind="residentLink"
                    id={l.id}
                    name={l.residentName}
                    onRemoved={load}
                    disabled={busy}
                  />
                  {!l.revoked && (
                    <>
                      <CopyLink url={l.url} />
                      <div className="management-actions">
                        <a href={l.url} target="_blank" rel="noreferrer">
                          Open request form
                        </a>
                        <Button
                          type="submit"
                          disabled={busy}
                          onClick={() =>
                            save({ action: "revokeLink", id: l.id })
                          }
                        >
                          Revoke link
                        </Button>
                      </div>
                    </>
                  )}
                </article>
              ))}
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
                    label={<>Request status</>}
                    value={m.status}
                    disabled={busy}
                    onValueChange={(value) =>
                      save({
                        action: "maintenanceStatus",
                        id: m.id,
                        status: value,
                      })
                    }
                  >
                    {maintenanceStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </AppSelect>
                  <RemoveButton
                    kind="maintenance"
                    id={m.id}
                    name={m.data.subject}
                    onRemoved={load}
                    disabled={busy}
                  />
                </details>
              ))}
            </section>
          )}
          <p className="small-note">
            Workspace shows the latest 200 records per section.
          </p>
        </>
      )}
    </>
  );
}
export type Save = (body: unknown) => Promise<boolean>;
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
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        maxLength={500}
      />
    </label>
  );
}
export function PropertySelect({
  properties,
}: {
  properties: PropertyRecord[];
}) {
  return (
    <AppSelect
      label={<>Property</>}
      name="propertyId"
      aria-label="Property"
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
        type="button"
        onClick={() =>
          navigator.clipboard
            .writeText(url)
            .then(() => setMessage("Copied."))
            .catch(() => setMessage("Copy the link below."))
        }
      >
        Copy private link
      </Button>
      <span role="status">{message}</span>
      {message === "Copy the link below." && (
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
            type="submit"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add property
          </Button>
        </div>
      </div>
      {properties.map((p) => (
        <article className="record" key={p.id}>
          <h3>{p.data.name}</h3>
          <p>
            {p.data.address} · {dollars(p.data.rentCents)} / month
          </p>
          <p>
            {p.data.published ? "Published" : "Draft"} ·{" "}
            {p.data.acceptingApplications
              ? p.data.published
                ? "Applications open"
                : "Applications enabled after publishing"
              : "Applications closed"}
          </p>
          <div className="management-actions">
            <Button
              type="submit"
              onClick={() => {
                setEditing(p);
                setOpen(true);
              }}
            >
              Edit {p.data.name}
            </Button>
            <RemoveButton
              kind="property"
              id={p.id}
              name={p.data.name}
              disabled={busy}
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
            {p.data.published && (
              <a
                href={`/properties/${p.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                View listing
              </a>
            )}
          </div>
        </article>
      ))}
      {open && (
        <form
          key={editing?.id ?? "new"}
          className="management-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const s = (key: string) => String(f.get(key) ?? "");
            const ok = await save({
              action: "property",
              id: editing?.id ?? crypto.randomUUID(),
              revision: editing?.revision ?? 0,
              data: {
                name: s("name"),
                address: s("address"),
                description: s("description"),
                amenities: f.getAll("amenities").map(String),
                rentCents: Math.round(Number(s("rent")) * 100),
                bedrooms: Number(s("bedrooms")),
                bathrooms: Number(s("bathrooms")),
                availableDate: s("availableDate"),
                contact: s("contact"),
                emergencyContact: data?.emergencyContact ?? "",
                published: f.get("published") === "on",
                acceptingApplications: f.get("acceptingApplications") === "on",
              },
            });
            if (ok) setOpen(false);
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
              <Field name="name" label="Property name" value={data?.name} />
              <Field
                name="address"
                label="Property address"
                value={data?.address}
              />
              <Field
                name="rent"
                label="Monthly rent ($)"
                type="number"
                value={data ? data.rentCents / 100 : undefined}
              />
              <Field
                name="bedrooms"
                label="Bedrooms"
                type="number"
                value={data?.bedrooms}
              />
              <Field
                name="bathrooms"
                label="Bathrooms"
                type="number"
                value={data?.bathrooms}
              />
              <Field
                name="availableDate"
                label="Available date"
                type="date"
                value={data?.availableDate}
                required={false}
              />
              <Field
                name="contact"
                label="Public owner contact"
                value={data?.contact}
              />
              <div className="field">
                <span>Urgent repairs</span>
                <a href="/admin#maintenance" target="_blank" rel="noreferrer">
                  Open maintenance portal
                </a>
                <small>Manage resident request links in a new tab.</small>
              </div>
            </div>
            <label className="field">
              Listing description
              <textarea
                name="description"
                defaultValue={data?.description}
                required
                rows={5}
              />
            </label>
            <AmenityPicker selected={data?.amenities} />
            <p>
              Selection criteria are managed centrally.{" "}
              <a href="/#criteria" target="_blank" rel="noreferrer">
                View selection criteria
              </a>
            </p>
            <p className="small-note">
              Save this property, then add its photos in Photos & publishing.
            </p>
            <label className="check-row">
              <input
                name="published"
                type="checkbox"
                defaultChecked={data?.published}
              />
              Publish this listing
            </label>
            <label className="check-row">
              <input
                name="acceptingApplications"
                type="checkbox"
                defaultChecked={data?.acceptingApplications}
              />
              Accept applications
            </label>
            <Button type="submit" variant="primary" className="submit-button">
              Save property
            </Button>
          </fieldset>
        </form>
      )}
      {!properties.length && !open && (
        <p className="management-empty">
          Add your first property to start listing and accepting applications.
        </p>
      )}
    </section>
  );
}
function InvoiceForm({
  properties,
  save,
  busy,
}: {
  properties: PropertyRecord[];
  save: Save;
  busy: boolean;
}) {
  const [id, setId] = useState(() => crypto.randomUUID());
  return (
    <form
      className="management-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        const ok = await save({
          action: "invoice",
          id,
          data: {
            propertyId: f.get("propertyId"),
            payerName: f.get("payerName"),
            payerEmail: f.get("payerEmail"),
            category: f.get("category"),
            description: f.get("description"),
            amountCents: Math.round(Number(f.get("amount")) * 100),
            dueDate: f.get("dueDate"),
          },
        });
        if (ok) {
          setId(crypto.randomUUID());
          form.reset();
        }
      }}
    >
      <fieldset disabled={busy}>
        <div className="fields">
          <PropertySelect properties={properties} />
          <Field name="payerName" label="Payer name" />
          <Field name="payerEmail" label="Payer email" type="email" />
          <AppSelect label={<>Payment type</>} name="category">
            <option value="rent">Rent</option>
            <option value="deposit">Deposit</option>
            <option value="application_fee">Application fee</option>
            <option value="other">Other</option>
          </AppSelect>
          <Field name="description" label="Description / rent period" />
          <Field name="amount" label="Amount ($)" type="number" />
          <Field name="dueDate" label="Due date" type="date" />
        </div>
        <p>
          Confirm the amount and recipient. Requests are immutable once created.
          No email is sent; copy and share the private link.
        </p>
        <Button
          type="submit"
          variant="primary"
          className="submit-button"
          disabled={!properties.length}
        >
          Create payment request
        </Button>
      </fieldset>
    </form>
  );
}
