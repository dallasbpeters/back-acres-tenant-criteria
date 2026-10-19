"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

const selectAll = (e: { currentTarget: HTMLInputElement }) =>
  e.currentTarget.select();

/**
 * Makes a fresh private signing link for one signer, copies it, and shows it,
 * for texting to a signer whose email does not work.
 */
export function CopySigningLink({
  disabled,
  name,
  signerId,
}: {
  disabled?: boolean;
  name: string;
  signerId: string;
}) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  const copy = useCallback(async () => {
    if (
      // biome-ignore lint/suspicious/noAlert: A new link makes every earlier link for this signer stop working.
      !window.confirm(
        `Make a new signing link for ${name}? Any link sent earlier stops working.`
      )
    ) {
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/lease-signing", {
        body: JSON.stringify({ action: "link", signerId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not make a signing link.");
      }
      setUrl(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        setNote(`Copied. Text this private link to ${name}.`);
      } catch {
        setNote(`Copy this private link and text it to ${name}.`);
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [name, signerId]);
  return (
    <div className="copy-signing-link">
      <Button disabled={disabled || busy} onPress={copy}>
        {busy ? "Making link…" : "Copy signing link"}
      </Button>
      {!!url && (
        <input
          aria-label={`Signing link for ${name}`}
          onFocus={selectAll}
          readOnly
          value={url}
        />
      )}
      {!!note && (
        <p className="small-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
