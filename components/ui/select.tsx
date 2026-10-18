// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";

interface Option {
  disabled: boolean;
  label: string;
  value: string;
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(text).join("");
  }
  return "";
}
function optionsFrom(children: ReactNode): Option[] {
  const options: Option[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        value?: string;
        disabled?: boolean;
      }>(child)
    ) {
      return;
    }
    if (child.type === Fragment) {
      options.push(...optionsFrom(child.props.children));
    } else if (child.type === "option") {
      const label = text(child.props.children);
      options.push({
        disabled: !!child.props.disabled,
        label,
        value: child.props.value ?? label,
      });
    }
  });
  return options;
}
export function AppSelect({
  label,
  className,
  children,
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  name,
  "aria-label": ariaLabel,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  "aria-label"?: string;
}) {
  const options = optionsFrom(children),
    placeholder =
      options.find((o) => o.value === "")?.label ?? "Choose an option";
  const items = options
    .filter((o) => o.value !== "")
    .map((o) => ({ ...o, id: o.value }));

  return (
    <Select
      aria-label={ariaLabel}
      className={`field app-select ${className ?? ""}`}
      isDisabled={disabled}
      isRequired={required}
      name={name}
      validationBehavior="native"
      {...(value === undefined
        ? { defaultSelectedKey: (defaultValue ?? options[0]?.value) || null }
        : { selectedKey: value || null })}
      onSelectionChange={(key) =>
        onValueChange?.(key === null ? "" : String(key))
      }
      placeholder={placeholder}
    >
      <Label>{label}</Label>
      <Button className="app-select-trigger">
        <SelectValue className="app-select-value">
          {({ selectedText, isPlaceholder }) =>
            isPlaceholder ? placeholder : selectedText
          }
        </SelectValue>
        <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
          <path
            d="m4 6 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </Button>
      <Popover
        className="app-select-popover"
        offset={5}
        placement="bottom start"
      >
        <ListBox className="app-select-options" items={items}>
          {(item) => (
            <ListBoxItem
              className="app-select-option"
              id={item.value}
              isDisabled={item.disabled}
              textValue={item.label}
            >
              <span>{item.label}</span>
              <svg
                aria-hidden="true"
                className="app-select-check"
                height="16"
                viewBox="0 0 16 16"
                width="16"
              >
                <path
                  d="m3 8 3 3 7-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
