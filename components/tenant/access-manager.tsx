// biome-ignore-all lint/performance/noJsxPropsBind: Native controls capture the selected invitation and pending state.
"use client";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { SectionCard } from "@/components/management/section-card";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";
import { type Person, TenantRow } from "./tenant-row";

interface Property {
  data: { name: string; address: string };
  id: string;
}
interface Invitation {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  propertyId: string;
}
interface Assignment {
  clerkUserId: string;
  id: string;
  name: string;
  propertyId: string;
  revokedAt: string | null;
}
interface Account {
  createdAt: number;
  email: string | null;
  id: string;
  lastSignInAt: number | null;
  name: string;
  phone: string | null;
}

/** One row per person: every portal account, plus access rows without one. */
function people(accounts: Account[], assignments: Assignment[]): Person[] {
  const rows: Person[] = accounts.map((account) => {
    const access = assignments.filter((a) => a.clerkUserId === account.id);
    // The name the owner gave (or the lease name) beats an unnamed account.
    const named = access.find((a) => a.name !== "Unnamed account")?.name;
    return { access, account, name: named ?? account.name };
  });
  for (const access of assignments) {
    if (!accounts.some((a) => a.id === access.clerkUserId)) {
      rows.push({ access: [access], account: null, name: access.name });
    }
  }
  return rows;
}

export function TenantAccessManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [invitePropertyId, setInvitePropertyId] = useState("");
  const load = useCallback(async () => {
    const [managementResponse, accessResponse] = await Promise.all([
      fetch("/api/admin/management"),
      fetch("/api/admin/tenants"),
    ]);
    if (!(managementResponse.ok && accessResponse.ok)) {
      throw new Error("Could not load tenants. Please refresh.");
    }
    const [management, access] = await Promise.all([
      managementResponse.json(),
      accessResponse.json(),
    ]);
    setProperties(management.properties);
    setAssignments(access.assignments);
    setAccounts(access.accounts ?? []);
    setInvitations(access.invitations ?? []);
    setReady(access.ready);
  }, []);
  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
  }, [load]);
  const send = useCallback(
    async (body: unknown, success: string) => {
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
          throw new Error(result.error || "Could not save.");
        }
        await load();
        setMessage(
          result.invited
            ? "No account uses this email yet, so we emailed an invitation. Access starts when they create their account."
            : success
        );
        return true;
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Please try again."
        );
        return false;
      } finally {
        setPending(false);
      }
    },
    [load]
  );
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await send(
      {
        action: "assign",
        data: {
          email: data.get("email"),
          name: data.get("name"),
          propertyId: invitePropertyId,
        },
      },
      "Tenant connected."
    );
    if (ok) {
      form.reset();
    }
  }
  const list = people(accounts, assignments);
  return (
    <div className="tenant-admin">
      <p className="tenant-admin-intro">
        Everyone with a tenant portal account is listed here. Connect each
        person to their rental. Leases signed with their phone number or email
        attach when you connect. Share payments with them from Payments.
      </p>
      {!ready && (
        <p className="tenant-notice" role="status">
          Clerk is not configured in this environment. You can still rename
          tenants and remove access.
        </p>
      )}
      <p aria-live="polite" className="tenant-admin-status" role="status">
        {message}
      </p>
      <SectionCard labelledBy="tenants-heading">
        <h2 id="tenants-heading">Tenants</h2>
        {list.length ? (
          <ul className="tenant-rows">
            {list.map((person) => (
              <TenantRow
                busy={pending}
                key={person.account?.id ?? person.access[0]?.id}
                onSend={send}
                person={person}
                properties={properties}
                ready={ready}
              />
            ))}
          </ul>
        ) : (
          <p className="tenant-empty-state">
            No tenant accounts yet. Tenants appear here when they create a
            portal account, or when you invite them below.
          </p>
        )}
      </SectionCard>
      {invitations.length > 0 && (
        <SectionCard labelledBy="invitations-heading">
          <h2 id="invitations-heading">Waiting for sign-up</h2>
          <ul className="tenant-rows">
            {invitations.map((invitation) => (
              <li className="tenant-row" key={invitation.id}>
                <div className="tenant-row-who">
                  <strong>{invitation.name}</strong>
                  <span>{invitation.email}</span>
                  <span className="small-note">
                    Invited to{" "}
                    {properties.find((p) => p.id === invitation.propertyId)
                      ?.data.name ?? "a removed property"}{" "}
                    on {new Date(invitation.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="tenant-row-actions">
                  <Button
                    disabled={pending || !ready}
                    onPress={() =>
                      send(
                        { action: "resendInvite", id: invitation.id },
                        `Invitation sent again to ${invitation.email}.`
                      )
                    }
                  >
                    Resend
                  </Button>
                  <Button
                    disabled={pending || !ready}
                    onPress={() =>
                      send(
                        { action: "cancelInvite", id: invitation.id },
                        "Invitation canceled."
                      )
                    }
                    variant="quiet"
                  >
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <SectionCard labelledBy="invite-heading">
        <details className="tenant-invite">
          <summary id="invite-heading">Invite someone by email</summary>
          <p className="small-note">
            For a tenant without an account. If the email already has an
            account, it connects now; otherwise we email an invitation.
          </p>
          <form className="tenant-invite-form" onSubmit={invite}>
            <AppSelect
              label="Property"
              onValueChange={setInvitePropertyId}
              required
              value={invitePropertyId}
            >
              <option value="">Choose property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.data.name}
                </option>
              ))}
            </AppSelect>
            <label className="field">
              Name
              <input maxLength={300} name="name" required />
            </label>
            <label className="field">
              Email
              <input maxLength={254} name="email" required type="email" />
            </label>
            <Button
              disabled={pending || !ready || !invitePropertyId}
              type="submit"
              variant="primary"
            >
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        </details>
      </SectionCard>
    </div>
  );
}
