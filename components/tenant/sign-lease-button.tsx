"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Opens signing from the portal. It uses fetch, not a form post: the site's
 * no-referrer policy makes a native form post send `Origin: null`, which the
 * origin check refuses.
 */
export function SignLeaseButton({ packetId }: { packetId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const open = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/tenant/leases/${packetId}/sign`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not open this lease.");
      }
      window.location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }, [packetId]);
  return (
    <>
      <Button disabled={busy} onPress={open} variant="primary">
        {busy ? "Opening lease…" : "Review and sign lease"}
      </Button>
      {!!error && <p role="alert">{error}</p>}
    </>
  );
}
