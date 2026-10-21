"use client";
import type { ReactNode } from "react";

export type StepState = "current" | "done" | "todo";
export interface GuideStep {
  body?: ReactNode;
  /** A link to where this step happens. */
  href?: string;
  linkLabel?: string;
  state?: StepState;
  title: string;
}

/** Numbered steps; done steps show a check, the current one stands out. */
export function StepList({
  label,
  steps,
}: {
  label: string;
  steps: GuideStep[];
}) {
  return (
    <ol aria-label={label} className="guide-steps">
      {steps.map((step, index) => (
        <li
          aria-current={step.state === "current" ? "step" : undefined}
          className="guide-step"
          data-state={step.state ?? "todo"}
          key={step.title}
        >
          <span aria-hidden="true" className="guide-step-marker">
            {step.state === "done" ? "✓" : index + 1}
          </span>
          <div className="guide-step-text">
            <p className="guide-step-title">
              {step.title}
              {step.state === "done" && (
                <span className="visually-hidden"> (done)</span>
              )}
            </p>
            {!!step.body && <div className="guide-step-body">{step.body}</div>}
            {!!step.href && (
              <a className="guide-step-link" href={step.href}>
                {step.linkLabel ?? "Go there"}
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
