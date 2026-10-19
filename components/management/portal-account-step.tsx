"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * After a tenant signs: create or sign in to a portal account. A one-time
 * code from this signing session attaches that account to the lease and the
 * property, whatever email or username it uses.
 */
export function PortalAccountStep({
  onClaim,
}: {
  onClaim: () => Promise<string>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const go = useCallback(
    async (page: "/sign-in" | "/sign-up") => {
      setBusy(true);
      setError("");
      try {
        const code = await onClaim();
        const next = `/tenant?claim=${encodeURIComponent(code)}`;
        window.location.assign(
          `${page}?redirect_url=${encodeURIComponent(next)}`
        );
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    },
    [onClaim]
  );
  const signUp = useCallback(() => go("/sign-up"), [go]);
  const signIn = useCallback(() => go("/sign-in"), [go]);
  return (
    <section aria-labelledby="portal-account" className="portal-account-step">
      <h3 id="portal-account">Next: your tenant portal</h3>
      <p>
        Your portal keeps a copy of this lease and shows payments, renters
        insurance and maintenance requests. Create an account with any email you
        check, or with Google. This lease is added to it automatically.
      </p>
      <div className="management-actions">
        <Button disabled={busy} onPress={signUp} variant="primary">
          {busy ? "Opening…" : "Create your portal account"}
        </Button>
        <Button disabled={busy} onPress={signIn} variant="quiet">
          I already have an account
        </Button>
      </div>
      {!!error && <p role="alert">{error}</p>}
    </section>
  );
}
