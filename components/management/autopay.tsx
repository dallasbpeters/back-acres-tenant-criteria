"use client";
import { Button } from "@/components/ui/button";

import { useState } from "react";
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, authorized: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign(result.url || window.location.pathname);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update autopay.");
      setBusy(false);
    }
  }
  return (
    <>
      {enroll && (
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
            <Button type="submit" variant="primary" className="submit-button">
              {busy ? "Opening…" : "Continue to secure bank authorization"}
            </Button>
          </fieldset>
        </form>
      )}
      {stop && (
        <Button
          type="submit"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Stop future automatic rent debits? Payments already submitted may still complete. Your lease and rent obligation remain in effect.",
              )
            )
              submit("stop");
          }}
        >
          Stop future automatic payments
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
