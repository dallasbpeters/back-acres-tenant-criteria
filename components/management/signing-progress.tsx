import type { StepState } from "@/components/guide/step-list";

/**
 * Where the signer is: read, initial (when the lease asks), sign, and for
 * tenants, the portal account that keeps their copy.
 */
export function SigningProgress({
  hasInitials,
  initialed,
  read,
  signed,
  tenant,
}: {
  hasInitials: boolean;
  initialed: boolean;
  read: boolean;
  signed: boolean;
  tenant: boolean;
}) {
  const steps: { label: string; done: boolean }[] = [
    { done: read || signed, label: "Read the lease" },
    ...(hasInitials
      ? [{ done: initialed || signed, label: "Initial the marked spots" }]
      : []),
    { done: signed, label: "Sign" },
    ...(tenant ? [{ done: false, label: "Open your portal" }] : []),
  ];
  const current = steps.findIndex((step) => !step.done);
  return (
    <ol aria-label="Signing steps" className="signing-progress-strip">
      {steps.map((step, index) => {
        let state: StepState = "todo";
        if (step.done) {
          state = "done";
        } else if (index === current) {
          state = "current";
        }
        return (
          <li
            aria-current={state === "current" ? "step" : undefined}
            data-state={state}
            key={step.label}
          >
            <span aria-hidden="true">{state === "done" ? "✓" : index + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
