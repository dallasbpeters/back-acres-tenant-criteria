"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

export function EmailTest() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const send = useCallback(async () => {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/email-test", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not send test email.");
      }
      setMessage(
        `Resend accepted the test email to ${result.recipient} from ${result.sender}. Reference: ${result.id}. Check Resend's email log for delivery confirmation.`
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not send test email."
      );
    } finally {
      setPending(false);
    }
  }, []);
  return (
    <section aria-label="Email delivery test">
      <h3>Email delivery</h3>
      <p>
        Send a clearly labeled test message to your signed-in owner email
        address. No tenant records are created.
      </p>
      <Button disabled={pending} onPress={send}>
        {pending ? "Sending test…" : "Send test email"}
      </Button>
      {!!message && <p role="status">{message}</p>}
      {!!error && <p role="alert">{error}</p>}
    </section>
  );
}
