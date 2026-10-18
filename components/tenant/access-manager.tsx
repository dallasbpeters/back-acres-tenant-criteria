// biome-ignore-all lint/performance/noJsxPropsBind: Native controls capture the selected property, grant, and pending state.
"use client";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import { dollars } from "@/lib/management/model";

interface Property {
  data: { name: string; address: string };
  id: string;
}
interface Invoice {
  amountCents: number;
  description: string;
  id: string;
  payerName: string;
  propertyId: string;
}
interface Schedule {
  id: string;
  monthlyCents: number;
  payerName: string;
  propertyId: string;
  status: string;
}
interface Assignment {
  id: string;
  name: string;
  propertyId: string;
  revokedAt: string | null;
}
export function TenantAccessManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [managementResponse, accessResponse] = await Promise.all([
      fetch("/api/admin/management"),
      fetch("/api/admin/tenants"),
    ]);
    if (!(managementResponse.ok && accessResponse.ok)) {
      throw new Error("Could not load tenant access. Please refresh.");
    }
    const [management, access] = await Promise.all([
      managementResponse.json(),
      accessResponse.json(),
    ]);
    setProperties(management.properties);
    setInvoices(management.invoices);
    setSchedules(management.rentSchedules);
    setAssignments(access.assignments);
    setReady(access.ready);
  }, []);
  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
  }, [load]);
  async function send(body: unknown) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/tenants", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not save tenant access.");
      }
      await load();
      setMessage("Tenant access updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    return send({
      action: "assign",
      data: {
        email: data.get("email"),
        invoiceIds: data.getAll("invoice"),
        name: data.get("name"),
        propertyId,
        scheduleIds: data.getAll("schedule"),
      },
    });
  }
  return (
    <>
      <p>
        Tenants first create an account at{" "}
        <a href="/sign-up" rel="noreferrer" target="_blank">
          Tenant registration
        </a>{" "}
        and verify their email. Then connect the account to a property and
        choose the records they can see. No invitation email is sent by this
        form.
      </p>
      {!ready && (
        <p role="status">
          Clerk is not configured in this environment. You can still revoke
          existing access.
        </p>
      )}
      <section>
        <h2>Property access</h2>
        {assignments.length ? (
          <ul className="tenant-access-list">
            {assignments.map((access) => (
              <li key={access.id}>
                <div>
                  <strong>{access.name}</strong>
                  <p>
                    {properties.find(
                      (property) => property.id === access.propertyId
                    )?.data.name ?? "Removed property"}{" "}
                    · {access.revokedAt ? "Access removed" : "Active"}
                  </p>
                </div>
                {!access.revokedAt && (
                  <Button
                    disabled={pending}
                    onPress={() => setRemoving(access.id)}
                    variant="danger"
                  >
                    Remove access
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No tenant accounts connected yet.</p>
        )}
      </section>
      <section>
        <h2>Connect a tenant</h2>
        <p className="small-note">
          Submitting again for the same account and property replaces their
          shared payment records and restores removed access. Review every
          selected record before saving.
        </p>
        <form className="tenant-form" onSubmit={submit}>
          <AppSelect
            label="Property"
            onValueChange={setPropertyId}
            required
            value={propertyId}
          >
            <option value="">Choose property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.data.name} · {property.data.address}
              </option>
            ))}
          </AppSelect>
          <div className="tenant-grid">
            <label>
              Tenant name
              <input maxLength={300} name="name" required />
            </label>
            <label>
              Verified account email
              <input maxLength={254} name="email" required type="email" />
            </label>
          </div>
          {!!propertyId && (
            <fieldset key={propertyId}>
              <legend>Share payment history</legend>
              <p>
                Only selected records will be visible. New records must be
                shared here as they are created.
              </p>
              {invoices
                .filter((invoice) => invoice.propertyId === propertyId)
                .map((invoice) => (
                  <label className="check-label" key={invoice.id}>
                    <input name="invoice" type="checkbox" value={invoice.id} />
                    {invoice.payerName} · {invoice.description} ·{" "}
                    {dollars(invoice.amountCents)}
                  </label>
                ))}
              {schedules
                .filter((schedule) => schedule.propertyId === propertyId)
                .map((schedule) => (
                  <label className="check-label" key={schedule.id}>
                    <input
                      name="schedule"
                      type="checkbox"
                      value={schedule.id}
                    />
                    {schedule.payerName} · {dollars(schedule.monthlyCents)} per
                    month · {schedule.status.replaceAll("_", " ")}
                  </label>
                ))}
            </fieldset>
          )}
          <Button
            disabled={pending || !ready || !propertyId}
            type="submit"
            variant="primary"
          >
            {pending ? "Saving…" : "Save tenant access"}
          </Button>
        </form>
      </section>
      {!!removing && (
        <div role="alert">
          <p>
            Remove this tenant’s access to the property? Their payment and
            maintenance records will be retained.
          </p>
          <div className="tenant-navigation">
            <Button
              disabled={pending}
              onPress={async () => {
                await send({ action: "revoke", id: removing });
                setRemoving(null);
              }}
              variant="danger"
            >
              Confirm removal
            </Button>
            <Button onPress={() => setRemoving(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <p aria-live="polite" role="status">
        {message}
      </p>
    </>
  );
}
