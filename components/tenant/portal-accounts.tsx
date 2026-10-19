"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";

export interface PortalAccount {
  createdAt: number;
  email: string | null;
  id: string;
  lastSignInAt: number | null;
  name: string;
  phone: string | null;
}
interface Property {
  data: { name: string };
  id: string;
}
interface Access {
  clerkUserId: string;
  propertyId: string;
  revokedAt: string | null;
}
const day = (value: number) => new Date(value).toLocaleDateString("en-US");

/** Every portal account, what it is connected to, and a way to connect it. */
export function PortalAccounts({
  accounts,
  assignments,
  disabled,
  onConnect,
  properties,
}: {
  accounts: PortalAccount[];
  assignments: Access[];
  disabled: boolean;
  onConnect: (clerkUserId: string, propertyId: string) => void;
  properties: Property[];
}) {
  return (
    <section aria-labelledby="portal-accounts">
      <h2 id="portal-accounts">Portal accounts</h2>
      <p className="small-note">
        Everyone with a tenant portal account, including accounts you created in
        Clerk. Connect an account to a property to give it access. Leases signed
        with its phone number or email attach at the same time.
      </p>
      {accounts.length ? (
        <ul className="tenant-access-list">
          {accounts.map((account) => (
            <AccountRow
              account={account}
              connected={assignments
                .filter((a) => a.clerkUserId === account.id && !a.revokedAt)
                .map((a) => a.propertyId)}
              disabled={disabled}
              key={account.id}
              onConnect={onConnect}
              properties={properties}
            />
          ))}
        </ul>
      ) : (
        <p className="tenant-empty-state">No portal accounts yet.</p>
      )}
    </section>
  );
}

function AccountRow({
  account,
  connected,
  disabled,
  onConnect,
  properties,
}: {
  account: PortalAccount;
  connected: string[];
  disabled: boolean;
  onConnect: (clerkUserId: string, propertyId: string) => void;
  properties: Property[];
}) {
  const open = properties.filter((p) => !connected.includes(p.id));
  const [propertyId, setPropertyId] = useState(open[0]?.id ?? "");
  const connect = useCallback(
    () => onConnect(account.id, propertyId),
    [account.id, onConnect, propertyId]
  );
  const names = connected
    .map((id) => properties.find((p) => p.id === id)?.data.name)
    .filter(Boolean);
  return (
    <li>
      <div>
        <strong>{account.name}</strong>
        <p>{[account.email, account.phone].filter(Boolean).join(" · ")}</p>
        <p className="small-note">
          Joined {day(account.createdAt)} ·{" "}
          {account.lastSignInAt
            ? `Last signed in ${day(account.lastSignInAt)}`
            : "Has not signed in yet"}{" "}
          · {names.length ? `Connected: ${names.join(", ")}` : "Not connected"}
        </p>
      </div>
      {open.length > 0 && (
        <div className="portal-account-connect">
          <AppSelect
            label={`Property for ${account.name}`}
            onValueChange={setPropertyId}
            value={propertyId}
          >
            {open.map((property) => (
              <option key={property.id} value={property.id}>
                {property.data.name}
              </option>
            ))}
          </AppSelect>
          <Button
            disabled={disabled || !propertyId}
            onPress={connect}
            variant="primary"
          >
            Connect
          </Button>
        </div>
      )}
    </li>
  );
}
