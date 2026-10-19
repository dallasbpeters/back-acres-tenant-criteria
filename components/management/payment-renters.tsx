// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls capture the current renter and record.
"use client";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/select";

export interface PaymentRenter {
  email: string;
  id: string;
  invoiceIds: string[];
  name: string;
  propertyId: string;
  scheduleIds: string[];
  type: "access" | "invitation";
}
type Kind = "invoice" | "schedule";
interface RentersContext {
  busy: boolean;
  error: string;
  renters: PaymentRenter[];
  share: (
    renter: PaymentRenter,
    kind: Kind,
    recordId: string,
    shared: boolean
  ) => Promise<void>;
}
const Context = createContext<RentersContext | null>(null);

/** Loads connected and invited renters once for the Payments tab. */
export function PaymentRentersProvider({ children }: { children: ReactNode }) {
  const [renters, setRenters] = useState<PaymentRenter[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/tenants");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not load renters.");
    }
    setRenters([
      ...(
        data.assignments as (Omit<PaymentRenter, "email" | "type"> & {
          clerkUserId: string;
          revokedAt: string | null;
        })[]
      )
        .filter((row) => !row.revokedAt)
        .map((row) => ({
          // The account's sign-in email, when it has one.
          email:
            (
              data.accounts as
                | { email: string | null; id: string }[]
                | undefined
            )?.find((account) => account.id === row.clerkUserId)?.email ?? "",
          id: row.id,
          invoiceIds: row.invoiceIds,
          name: row.name,
          propertyId: row.propertyId,
          scheduleIds: row.scheduleIds,
          type: "access" as const,
        })),
      ...(data.invitations as Omit<PaymentRenter, "type">[]).map((row) => ({
        ...row,
        type: "invitation" as const,
      })),
    ]);
  }, []);
  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);
  const share = useCallback(
    async (
      renter: PaymentRenter,
      kind: Kind,
      recordId: string,
      shared: boolean
    ) => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/admin/tenants", {
          body: JSON.stringify({
            action: "share",
            kind,
            recordId,
            shared,
            target: { id: renter.id, type: renter.type },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Could not update sharing.");
        }
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load]
  );
  return (
    <Context.Provider value={{ busy, error, renters, share }}>
      {children}
    </Context.Provider>
  );
}

export function useRenters() {
  const value = useContext(Context);
  if (!value) {
    throw new Error("PaymentRentersProvider is missing.");
  }
  return value;
}

/** Renters per property, with how many payments each can see. */
export function RentersOverview({
  propertyName,
}: {
  propertyName: (id: string) => string | undefined;
}) {
  const { error, renters } = useRenters();
  return (
    <section aria-labelledby="payment-renters" className="payment-renters">
      <div className="payment-renters-heading">
        <h3 id="payment-renters">Renters</h3>
        <a href="/admin/tenants">Invite or manage renters</a>
      </div>
      {!!error && <p role="alert">{error}</p>}
      {renters.length ? (
        <ul className="payment-renters-list">
          {renters.map((renter) => (
            <li key={`${renter.type}-${renter.id}`}>
              <span className="payment-renter-name">{renter.name}</span>
              <span className="small-note">
                {propertyName(renter.propertyId) ?? "Removed property"} ·{" "}
                {renter.type === "access"
                  ? "Portal account"
                  : `Invited (${renter.email})`}{" "}
                · {renter.invoiceIds.length + renter.scheduleIds.length} shared{" "}
                {renter.invoiceIds.length + renter.scheduleIds.length === 1
                  ? "payment"
                  : "payments"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small-note">
          No renters yet. Invite one under Tenant access, then assign payments
          to them here.
        </p>
      )}
    </section>
  );
}

/** Shows who can see one payment and lets the owner assign it to a renter. */
export function RenterSharing({
  kind,
  propertyId,
  recordId,
}: {
  kind: Kind;
  propertyId: string;
  recordId: string;
}) {
  const { busy, renters, share } = useRenters();
  const forProperty = renters.filter((r) => r.propertyId === propertyId);
  const ids = (r: PaymentRenter) =>
    kind === "invoice" ? r.invoiceIds : r.scheduleIds;
  const sharedWith = forProperty.filter((r) => ids(r).includes(recordId));
  const available = forProperty.filter((r) => !ids(r).includes(recordId));
  if (!forProperty.length) {
    return (
      <p className="small-note renter-sharing">
        No renters for this property yet, so no tenant sees this in their
        portal.
      </p>
    );
  }
  return (
    <div className="renter-sharing">
      <span className="renter-sharing-label">
        {sharedWith.length ? "Shared with" : "Not shared with any renter"}
      </span>
      {sharedWith.map((renter) => (
        <span className="renter-chip" key={`${renter.type}-${renter.id}`}>
          {renter.name}
          {renter.type === "invitation" ? " (invited)" : ""}
          <Button
            aria-label={`Stop sharing with ${renter.name}`}
            className="renter-chip-remove"
            disabled={busy}
            onClick={() => share(renter, kind, recordId, false)}
            type="button"
            variant="quiet"
          >
            ×
          </Button>
        </span>
      ))}
      {available.length > 0 && (
        <AppSelect
          disabled={busy}
          label="Assign to renter"
          onValueChange={(key) => {
            const renter = available.find((r) => `${r.type}-${r.id}` === key);
            if (renter) {
              share(renter, kind, recordId, true);
            }
          }}
          value=""
        >
          <option value="">Choose a renter…</option>
          {available.map((renter) => (
            <option
              key={`${renter.type}-${renter.id}`}
              value={`${renter.type}-${renter.id}`}
            >
              {renter.name}
              {renter.type === "invitation" ? " (invited)" : ""}
            </option>
          ))}
        </AppSelect>
      )}
    </div>
  );
}
