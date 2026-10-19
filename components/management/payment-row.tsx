"use client";
import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type OverflowAction,
  OverflowMenu,
} from "@/components/ui/overflow-menu";

export type StatusTone = "active" | "attention" | "done" | "waiting";

/**
 * One payment record: who and how much on the left, its status, then the
 * main action and a menu for the rest. Sharing sits underneath.
 */
export function PaymentRow({
  actions,
  amount,
  children,
  meta,
  primary,
  status,
  test,
  title,
}: {
  actions: OverflowAction[];
  amount: string;
  children?: ReactNode;
  meta: string;
  primary?: ReactNode;
  status: { label: string; tone: StatusTone };
  test: boolean;
  title: string;
}) {
  return (
    <li className="payment-row">
      <div className="payment-row-main">
        <p className="payment-row-title">
          {title}
          <span className="payment-row-amount">{amount}</span>
        </p>
        <p className="small-note">{meta}</p>
      </div>
      <div className="payment-row-status">
        <span className="payment-status" data-tone={status.tone}>
          {status.label}
        </span>
        {!!test && (
          <span className="payment-status payment-status--test">Test</span>
        )}
      </div>
      <div className="payment-row-actions">
        {primary}
        <OverflowMenu actions={actions} label={`More actions for ${title}`} />
      </div>
      {!!children && <div className="payment-row-sharing">{children}</div>}
    </li>
  );
}

/** Copies a private link and says so; shows the link if copying fails. */
export function CopyLinkButton({
  label = "Copy link",
  url,
}: {
  label?: string;
  url: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(url)
      .then(() => setState("copied"))
      .catch(() => setState("failed"));
  }, [url]);
  const select = useCallback(
    (e: { currentTarget: HTMLInputElement }) => e.currentTarget.select(),
    []
  );
  if (state === "failed") {
    return (
      <input
        aria-label="Private link"
        className="payment-link-input"
        onFocus={select}
        readOnly
        value={url}
      />
    );
  }
  const text = state === "copied" ? "Copied" : label;
  return <Button onPress={copy}>{text}</Button>;
}
