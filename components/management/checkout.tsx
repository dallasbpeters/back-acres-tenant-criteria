"use client";
import { Button } from "@/components/ui/button";

import { useState } from "react";
export function Checkout({ token }: { token: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        type="submit"
        className="submit-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/payments/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            window.location.assign(data.url);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Unable to open checkout.",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening secure checkout…" : "Pay securely with Stripe"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
