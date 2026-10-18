// biome-ignore-all lint/performance/noJsxPropsBind: Native form callbacks capture current tenant input and pending state.
"use client";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
export function TenantRequestForm({
  id,
  name,
  email,
  phone,
  contact = "Back Acres Rentals",
}: {
  contact?: string;
  id: string;
  name: string;
  email: string;
  phone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/tenant", {
        body: JSON.stringify({
          action: "maintenance",
          data: {
            accessNotes: String(values.get("accessNotes")),
            description: String(values.get("description")),
            email,
            name,
            phone: String(values.get("phone")),
            priority: values.get("urgent") === "on" ? "urgent" : "routine",
            subject: String(values.get("subject")),
          },
          id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not submit the request.");
      }
      posthog.capture("tenant_maintenance_request_submitted", {
        priority: values.get("urgent") === "on" ? "urgent" : "routine",
      });
      form.reset();
      setMessage(`Request received. Reference: ${result.receipt}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="tenant-form" onSubmit={submit}>
      <label>
        Subject
        <input maxLength={200} name="subject" required />
      </label>
      <label>
        What needs repair?
        <textarea maxLength={5000} name="description" required rows={4} />
      </label>
      <label>
        Contact phone
        <input
          defaultValue={phone}
          maxLength={50}
          name="phone"
          required
          type="tel"
        />
      </label>
      <label>
        Entry instructions
        <textarea maxLength={2000} name="accessNotes" rows={2} />
      </label>
      <label className="check-label">
        <input name="urgent" type="checkbox" />
        Urgent repair
      </label>
      <p className="small-note">
        This portal is not monitored continuously. For immediate danger, call
        911. For urgent property damage, contact {contact} directly as well.
      </p>
      <Button disabled={pending} type="submit" variant="primary">
        {pending ? "Submitting…" : "Submit maintenance request"}
      </Button>
      <p aria-live="polite" role="status">
        {message}
      </p>
    </form>
  );
}
