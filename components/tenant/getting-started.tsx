import { type GuideStep, StepList } from "@/components/guide/step-list";
import type { invoices, rentSchedules } from "@/lib/db/schema";
import { dollars } from "@/lib/management/model";
import { linkToken } from "@/lib/management/security";
import type { TenantLease } from "@/lib/tenant/leases";

const running = new Set(["active", "not_started", "activating"]);
type Invoice = typeof invoices.$inferSelect;
type Schedule = typeof rentSchedules.$inferSelect;

function leaseStep(leases: TenantLease[]): GuideStep[] {
  if (!leases.length) {
    return [];
  }
  const signed = leases.every((l) => l.mySignedAt);
  return [
    {
      body: signed
        ? "Your signature is recorded. The signed copy is under Leases."
        : "Review the lease and sign it. You can sign right from Leases below.",
      href: signed ? undefined : "#leases",
      linkLabel: "Go to your lease",
      state: signed ? "done" : "todo",
      title: "Sign your lease",
    },
  ];
}

function depositSteps(payments: Invoice[]): GuideStep[] {
  return payments
    .filter((p) => p.category === "deposit")
    .map((deposit) => {
      const paid = deposit.status === "paid";
      return {
        body: paid
          ? "Paid. Thank you."
          : `${dollars(deposit.amountCents)} by bank transfer, due ${deposit.dueDate}.`,
        href:
          deposit.status === "open"
            ? `/pay/${linkToken("payment", deposit.id)}`
            : undefined,
        linkLabel: "Pay now",
        state: paid ? "done" : "todo",
        title: `Pay the ${deposit.description.toLowerCase()}`,
      };
    });
}

function autopayStep(schedules: Schedule[]): GuideStep[] {
  const autopay = schedules.filter((s) => s.collection === "ach");
  if (!autopay.length) {
    return [];
  }
  const next = autopay.find((s) => !running.has(s.status));
  return [
    {
      body: next
        ? "Connect your bank account once. Rent is then paid automatically each month."
        : "Rent is paid from your bank account each month.",
      href: next ? `/autopay/${linkToken("autopay", next.id)}` : undefined,
      linkLabel: "Set up automatic payments",
      state: next ? "todo" : "done",
      title: "Set up automatic rent",
    },
  ];
}

function insuranceStep(insurance: { status: string }[]): GuideStep {
  const covered = insurance.some((d) => d.status !== "rejected");
  return {
    body: covered
      ? "Uploaded. The owner will review it."
      : "Upload your declarations page or certificate of insurance.",
    href: covered ? undefined : "#insurance",
    linkLabel: "Upload insurance",
    state: covered ? "done" : "todo",
    title: "Add renters insurance",
  };
}

/**
 * A checklist for a new tenant that ticks itself off from their records,
 * and hides once everything is done.
 */
export function TenantGettingStarted({
  insurance,
  leases,
  payments,
  schedules,
}: {
  insurance: { status: string }[];
  leases: TenantLease[];
  payments: Invoice[];
  schedules: Schedule[];
}) {
  const steps = [
    ...leaseStep(leases),
    ...depositSteps(payments),
    ...autopayStep(schedules),
    insuranceStep(insurance),
  ];
  const firstOpen = steps.findIndex((step) => step.state !== "done");
  if (firstOpen < 0) {
    return null;
  }
  steps[firstOpen] = { ...steps[firstOpen], state: "current" };
  const done = steps.filter((step) => step.state === "done").length;
  return (
    <section
      aria-labelledby="getting-started"
      className="tenant-section tenant-getting-started"
    >
      <header className="tenant-section-head">
        <h3 id="getting-started">Getting started</h3>
        <p className="small-note">
          {done} of {steps.length} done. Request repairs under Maintenance at
          any time.
        </p>
      </header>
      <StepList label="Getting started" steps={steps} />
    </section>
  );
}
