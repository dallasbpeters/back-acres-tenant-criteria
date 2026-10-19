// biome-ignore-all lint/performance/noJsxPropsBind: Menu items capture their own action callbacks.
"use client";
import {
  Button as AriaButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";

export interface OverflowAction {
  /** Opens a URL (for downloads) instead of running an action. */
  href?: string;
  label: string;
  onAction?: () => void;
  tone?: "danger";
}

/** A "⋯" button that holds the less frequent actions for one record. */
export function OverflowMenu({
  actions,
  disabled,
  label,
}: {
  actions: OverflowAction[];
  disabled?: boolean;
  label: string;
}) {
  if (!actions.length) {
    return null;
  }
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={label}
        className="ui-button ui-button--quiet overflow-menu-trigger"
        isDisabled={disabled}
      >
        <span aria-hidden="true">⋯</span>
      </AriaButton>
      <Popover className="overflow-menu-popover" placement="bottom end">
        <Menu
          className="overflow-menu"
          onAction={(key) => actions[Number(key)]?.onAction?.()}
        >
          {actions.map((action, index) => (
            <MenuItem
              className={
                action.tone === "danger"
                  ? "overflow-menu-item overflow-menu-item--danger"
                  : "overflow-menu-item"
              }
              href={action.href}
              id={String(index)}
              key={action.label}
            >
              {action.label}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
