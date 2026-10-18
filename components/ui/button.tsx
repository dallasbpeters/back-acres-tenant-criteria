"use client";
import { forwardRef } from "react";
import { Button as AriaButton, type ButtonProps } from "react-aria-components";
export type AppButtonProps = ButtonProps & {
  disabled?: boolean;
  title?: string;
  variant?: "secondary" | "primary" | "danger" | "quiet";
};
export const Button = forwardRef<HTMLButtonElement, AppButtonProps>(
  function Button(
    {
      disabled,
      isDisabled,
      variant = "secondary",
      type = "button",
      className,
      ...props
    },
    ref,
  ) {
    return (
      <AriaButton
        {...props}
        ref={ref}
        type={type}
        isDisabled={disabled ?? isDisabled}
        className={(state) =>
          `ui-button ui-button--${variant} ${typeof className === "function" ? className(state) : (className ?? "")}`
        }
      />
    );
  },
);
