// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function AutopayControls({
  token,
  enroll,
  stop,
}: {
  token: string;
  enroll: boolean;
  stop: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(action: "enroll" | "stop") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payments/autopay", {
        body: JSON.stringify({ action, authorized: true, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error);
      }
      window.location.assign(result.url || window.location.pathname);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update autopay.");
      setBusy(false);
    }
  }

  return (
    <>
      {!!enroll && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit("enroll");
          }}
        >
          <fieldset disabled={busy}>
            <label className="check-row">
              <input required type="checkbox" />I am the named payer and I
              accept the payment authorization above. I will authorize and
              verify my own bank account with Stripe.
            </label>
            <Button className="submit-button" type="submit" variant="primary">
              {busy ? "Opening…" : "Continue to secure bank authorization"}
            </Button>
          </fieldset>
        </form>
      )}
      {!!stop && (
        <Button
          disabled={busy}
          onClick={() => {
            if (
              /* biome-ignore lint/suspicious/noAlert: Keep the explicit native confirmation before discarding edits, canceling collection, or withdrawing a signature. */ window.confirm(
                "Stop future automatic rent debits? Payments already submitted may still complete. Your lease and rent obligation remain in effect."
              )
            ) {
              submit("stop");
            }
          }}
          type="submit"
        >
          Stop future automatic payments
        </Button>
      )}
      {!!error && <p role="alert">{error}</p>}
    </>
  );
}
