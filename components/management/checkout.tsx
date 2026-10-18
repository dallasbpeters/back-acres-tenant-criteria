// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import posthog from "posthog-js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function Checkout({ token }: { token: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  return (
    <>
      <Button
        className="submit-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/payments/checkout", {
              body: JSON.stringify({ token }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            });
            const data = await r.json();
            if (!r.ok) {
              throw new Error(data.error);
            }
            posthog.capture("checkout_started");
            window.location.assign(data.url);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Unable to open checkout."
            );
            setBusy(false);
          }
        }}
        type="submit"
      >
        {busy ? "Opening secure checkout…" : "Pay securely with Stripe"}
      </Button>
      {!!error && <p role="alert">{error}</p>}
    </>
  );
}
