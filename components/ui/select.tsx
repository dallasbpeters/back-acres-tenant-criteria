"use client";
import { Children, isValidElement, Fragment, type ReactNode } from "react";
import {
  Select,
  Label,
  Button,
  SelectValue,
  Popover,
  ListBox,
  ListBoxItem,
} from "react-aria-components";
type Option = { value: string; label: string; disabled: boolean };
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
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
    )
      return;
    if (child.type === Fragment)
      options.push(...optionsFrom(child.props.children));
    else if (child.type === "option") {
      const label = text(child.props.children);
      options.push({
        value: child.props.value ?? label,
        label,
        disabled: !!child.props.disabled,
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
      className={`field app-select ${className ?? ""}`}
      name={name}
      aria-label={ariaLabel}
      isDisabled={disabled}
      isRequired={required}
      validationBehavior="native"
      {...(value !== undefined
        ? { selectedKey: value || null }
        : { defaultSelectedKey: (defaultValue ?? options[0]?.value) || null })}
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
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
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
        placement="bottom start"
        offset={5}
      >
        <ListBox className="app-select-options" items={items}>
          {(item) => (
            <ListBoxItem
              id={item.value}
              textValue={item.label}
              isDisabled={item.disabled}
              className="app-select-option"
            >
              <span>{item.label}</span>
              <svg
                className="app-select-check"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
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
