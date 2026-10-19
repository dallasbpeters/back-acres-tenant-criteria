// biome-ignore-all lint/performance/noJsxPropsBind: Row controls capture this tenant and the access being removed.
"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";

interface Access {
  clerkUserId: string;
  id: string;
  name: string;
  propertyId: string;
  revokedAt: string | null;
}
export interface Person {
  access: Access[];
  account: {
    email: string | null;
    id: string;
    lastSignInAt: number | null;
    phone: string | null;
  } | null;
  name: string;
}
interface Property {
  data: { name: string };
  id: string;
}
const day = (value: number) => new Date(value).toLocaleDateString("en-US");

/** One tenant: who they are, where they have access, and what to do next. */
export function TenantRow({
  busy,
  onSend,
  person,
  properties,
  ready,
}: {
  busy: boolean;
  onSend: (body: unknown, success: string) => Promise<boolean>;
  person: Person;
  properties: Property[];
  ready: boolean;
}) {
  const active = person.access.filter((a) => !a.revokedAt);
  const open = properties.filter(
    (p) => !active.some((a) => a.propertyId === p.id)
  );
  const [chosen, setChosen] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  // Default to the first open property once properties have loaded.
  const propertyId = chosen || open[0]?.id || "";
  const propertyName = (id: string) =>
    properties.find((p) => p.id === id)?.data.name ?? "Removed property";
  const { account } = person;
  let signInNote = "Portal account deleted";
  if (account) {
    signInNote = account.lastSignInAt
      ? `Last signed in ${day(account.lastSignInAt)}`
      : "Has not signed in yet";
  }
  const connect = useCallback(
    () =>
      account &&
      onSend(
        { action: "connect", clerkUserId: account.id, propertyId },
        `${person.name} connected. Leases signed with their phone or email are attached.`
      ),
    [account, onSend, person.name, propertyId]
  );
  const rename = useCallback(() => {
    const [target] = person.access;
    if (!target) {
      return;
    }
    // biome-ignore lint/suspicious/noAlert: A one-field rename does not need its own form.
    const name = window.prompt("Tenant name", person.name)?.trim();
    if (name && name !== person.name) {
      for (const access of person.access) {
        onSend({ action: "rename", id: access.id, name }, "Tenant renamed.");
      }
    }
  }, [onSend, person.access, person.name]);
  return (
    <li className="tenant-row">
      <div className="tenant-row-who">
        <strong>{person.name}</strong>
        {!!account && (
          <span>
            {[account.phone, account.email].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="small-note">{signInNote}</span>
      </div>
      <div className="tenant-row-access">
        {person.access.length ? (
          person.access.map((access) => (
            <span
              className="tenant-access-chip"
              data-active={access.revokedAt ? "false" : "true"}
              key={access.id}
            >
              {propertyName(access.propertyId)}
              {access.revokedAt ? " · access removed" : ""}
              {!access.revokedAt && (
                <button
                  aria-label={`Remove ${person.name}'s access to ${propertyName(access.propertyId)}`}
                  className="tenant-access-remove"
                  disabled={busy}
                  onClick={() => setRemoving(access.id)}
                  type="button"
                >
                  ×
                </button>
              )}
            </span>
          ))
        ) : (
          <span className="tenant-access-chip" data-active="false">
            Not connected
          </span>
        )}
      </div>
      <div className="tenant-row-actions">
        {!!account && open.length > 0 && (
          <>
            <AppSelect
              className="tenant-row-select"
              label={<span className="visually-hidden">Property</span>}
              onValueChange={setChosen}
              value={propertyId}
            >
              {open.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.data.name}
                </option>
              ))}
            </AppSelect>
            <Button
              disabled={busy || !ready || !propertyId}
              onPress={connect}
              variant={active.length ? "secondary" : "primary"}
            >
              Connect
            </Button>
          </>
        )}
        {person.access.length > 0 && (
          <Button disabled={busy} onPress={rename} variant="quiet">
            Rename
          </Button>
        )}
      </div>
      {!!removing && (
        <div className="tenant-row-confirm" role="alert">
          <p>
            Remove {person.name}’s access to{" "}
            {propertyName(
              person.access.find((a) => a.id === removing)?.propertyId ?? ""
            )}
            ? Their payment and maintenance records are kept.
          </p>
          <Button
            disabled={busy}
            onPress={async () => {
              await onSend(
                { action: "revoke", id: removing },
                "Access removed."
              );
              setRemoving(null);
            }}
            variant="danger"
          >
            Remove access
          </Button>
          <Button onPress={() => setRemoving(null)}>Keep access</Button>
        </div>
      )}
    </li>
  );
}
