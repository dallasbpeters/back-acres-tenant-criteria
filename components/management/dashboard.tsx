"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import {
  applicationStatuses,
  maintenanceStatuses,
  dollars,
  type PropertyInput,
  type ApplicationInput,
} from "@/lib/management/model";
import { POLICY, policyRecordText } from "@/lib/policy";
import { LeaseWorkspace } from "./leases";
export type PropertyRecord = {
  id: string;
  slug: string;
  revision: number;
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
  id: string;
  propertyId: string;
  templateId: string;
  parentId: string | null;
  tenantName: string;
  body: string;
  createdAt: string;
};
type Records = {
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
    load().catch((e) => setError(e.message));
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
    records?.properties.find((p) => p.id === id)?.data.name ?? "Property";
  return (
    <>
      <div className="management-actions">
        <a href="/admin/adverse-actions">Prepare an adverse-action notice</a>
        <button onClick={() => signOut({ callbackUrl: "/admin" })}>
          Sign out
        </button>
      </div>
      <nav className="management-tabs" aria-label="Workspace sections">
        {[
          "Properties",
          "Applications",
          "Leases",
          "Payments",
          "Maintenance",
        ].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setMessage("");
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => load().catch((e) => setError(e.message))}>
            Reload records
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!records ? (
        <p>Loading property records…</p>
      ) : (
        <>
          {tab === "Properties" && (
            <PropertyWorkspace
              properties={records.properties}
              save={save}
              busy={busy}
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
                  <label className="field">
                    Application status
                    <select
                      value={a.status}
                      disabled={busy}
                      onChange={(e) =>
                        save({
                          action: "applicationStatus",
                          id: a.id,
                          status: e.target.value,
                        })
                      }
                    >
                      {applicationStatuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <a href="/admin/adverse-actions">
                    Prepare a notice separately
                  </a>
                </details>
              ))}
            </section>
          )}
          {tab === "Leases" && (
            <LeaseWorkspace
              properties={records.properties}
              templates={records.templates}
              drafts={records.drafts}
              save={save}
              busy={busy}
            />
          )}
          {tab === "Payments" && (
            <section>
              <h2>Payment requests</h2>
              <p>
                {records.paymentsReady
                  ? `Stripe ${records.paymentMode} mode is configured.`
                  : "Stripe setup is pending. You can prepare requests; checkout remains unavailable."}{" "}
                Create a separate request for each rent period, deposit, or fee.
                Recurring autopay is not enabled.
              </p>
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
                  {i.status === "open" && (
                    <div className="management-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          save({ action: "voidInvoice", id: i.id })
                        }
                      >
                        Cancel payment request
                      </button>
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
                <button
                  className="submit-button"
                  disabled={busy || !records.properties.length}
                >
                  Create resident link
                </button>
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
                  {!l.revoked && (
                    <>
                      <CopyLink url={l.url} />
                      <div className="management-actions">
                        <a href={l.url} target="_blank" rel="noreferrer">
                          Open request form
                        </a>
                        <button
                          disabled={busy}
                          onClick={() =>
                            save({ action: "revokeLink", id: l.id })
                          }
                        >
                          Revoke link
                        </button>
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
                  <label className="field">
                    Request status
                    <select
                      value={m.status}
                      disabled={busy}
                      onChange={(e) =>
                        save({
                          action: "maintenanceStatus",
                          id: m.id,
                          status: e.target.value,
                        })
                      }
                    >
                      {maintenanceStatuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
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
    <label className="field">
      Property
      <select name="propertyId" aria-label="Property" required>
        <option value="">Choose a property</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.data.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function CopyLink({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="management-actions">
      <button
        type="button"
        onClick={() =>
          navigator.clipboard
            .writeText(url)
            .then(() => setMessage("Copied."))
            .catch(() => setMessage("Copy the link below."))
        }
      >
        Copy private link
      </button>
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
}: {
  properties: PropertyRecord[];
  save: Save;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<PropertyRecord | null>(null),
    [open, setOpen] = useState(false);
  const data = editing?.data;
  return (
    <section>
      <h2>Properties</h2>
      <div className="management-actions">
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add property
        </button>
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
              ? "Applications open"
              : "Applications closed"}
          </p>
          <div className="management-actions">
            <button
              onClick={() => {
                setEditing(p);
                setOpen(true);
              }}
            >
              Edit {p.data.name}
            </button>
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
                slug: s("slug"),
                address: s("address"),
                description: s("description"),
                rentCents: Math.round(Number(s("rent")) * 100),
                bedrooms: Number(s("bedrooms")),
                bathrooms: Number(s("bathrooms")),
                availableDate: s("availableDate"),
                contact: s("contact"),
                emergencyContact: s("emergencyContact"),
                criteria: s("criteria"),
                criteriaVersion: s("criteriaVersion"),
                published: f.get("published") === "on",
                acceptingApplications: f.get("acceptingApplications") === "on",
              },
            });
            if (ok) setOpen(false);
          }}
        >
          <h3>{editing ? "Edit property" : "New property"}</h3>
          <fieldset disabled={busy}>
            <div className="fields">
              <Field name="name" label="Property name" value={data?.name} />
              <Field
                name="slug"
                label="Listing URL name (lowercase-with-hyphens)"
                value={data?.slug}
              />
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
              <Field
                name="emergencyContact"
                label="Urgent repair contact"
                value={data?.emergencyContact}
              />
              <Field
                name="criteriaVersion"
                label="Criteria version"
                value={data?.criteriaVersion}
              />
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
            <label className="field">
              Selection criteria for this property
              <textarea
                name="criteria"
                defaultValue={data?.criteria}
                required
                rows={10}
              />
            </label>
            <p>
              Use the criteria applicable to this property. Update the criteria
              version whenever the terms change.
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
            <button className="submit-button">Save property</button>
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
          <label className="field">
            Payment type
            <select name="category">
              <option value="rent">Rent</option>
              <option value="deposit">Deposit</option>
              <option value="application_fee">Application fee</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Field name="description" label="Description / rent period" />
          <Field name="amount" label="Amount ($)" type="number" />
          <Field name="dueDate" label="Due date" type="date" />
        </div>
        <p>
          Confirm the amount and recipient. Requests are immutable once created.
          No email is sent; copy and share the private link.
        </p>
        <button className="submit-button" disabled={!properties.length}>
          Create payment request
        </button>
      </fieldset>
    </form>
  );
}
