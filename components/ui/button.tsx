// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import type { Ref } from "react";
import { Button as AriaButton, type ButtonProps } from "react-aria-components";
export type AppButtonProps = ButtonProps & {
  disabled?: boolean;
  title?: string;
  variant?: "secondary" | "primary" | "danger" | "quiet";
  ref?: Ref<HTMLButtonElement>;
};
export function Button({
  disabled,
  isDisabled,
  variant = "secondary",
  type = "button",
  className,
  ref,
  ...props
}: AppButtonProps) {
  return (
    <AriaButton
      {...props}
      className={(state) =>
        `ui-button ui-button--${variant} ${typeof className === "function" ? className(state) : (className ?? "")}`
      }
      isDisabled={disabled ?? isDisabled}
      ref={ref}
      type={type}
    />
  );
}
