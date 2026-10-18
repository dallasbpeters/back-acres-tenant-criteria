// biome-ignore-all lint/performance/noJsxPropsBind: The native form callback captures current tenant input and pending state.
"use client";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
export function TenantContactForm({
  id,
  name,
  phone,
}: {
  id: string;
  name: string;
  phone: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/tenant", {
        body: JSON.stringify({
          action: "settings",
          id,
          phone: String(data.get("phone")),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not save contact details.");
      }
      posthog.capture("tenant_contact_phone_saved");
      setMessage("Contact phone saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="tenant-form" onSubmit={submit}>
      <h3>Property contact: {name}</h3>
      <label>
        Contact phone
        <input defaultValue={phone} maxLength={50} name="phone" type="tel" />
      </label>
      <Button disabled={pending} type="submit">
        {pending ? "Saving…" : "Save contact phone"}
      </Button>
      <p aria-live="polite" role="status">
        {message}
      </p>
    </form>
  );
}
