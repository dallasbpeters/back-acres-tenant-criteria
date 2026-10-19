// biome-ignore-all lint/performance/noJsxPropsBind: Each swatch captures its own token for the picker callback.
"use client";
import type { CSSProperties } from "react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Popover,
} from "react-aria-components";
import {
  type BrandColorToken,
  type BrandPalette,
  brandColorTokens,
  contrastChecks,
  contrastRatio,
  hexToOklch,
  oklchToHex,
  parseOklch,
} from "@/lib/brand-colors";
import { OklchPicker } from "./oklch-picker";

const darkText = "#0e1005";
const lightText = "#fffefa";
const tintSteps = [8, 16, 28, 40, 55, 70, 85];

/** Picks dark or light label text, whichever reads better on the swatch. */
function labelColor(value: string) {
  const color = parseOklch(value);
  const dark = hexToOklch(darkText);
  const light = hexToOklch(lightText);
  if (!(color && dark && light)) {
    return darkText;
  }
  return contrastRatio(color, dark) >= contrastRatio(color, light)
    ? darkText
    : lightText;
}

/**
 * A solid strip of brand colors. Each swatch opens a dropdown OKLCH picker.
 * The primary swatch is wider and shows its tints against the surface.
 */
export function BrandColorStrip({
  disabled,
  mode,
  onChange,
  palette,
}: {
  disabled?: boolean;
  mode: "dark" | "light";
  onChange: (token: BrandColorToken, value: string) => void;
  palette: BrandPalette;
}) {
  return (
    <ul
      aria-label={`${mode === "light" ? "Light" : "Dark"} mode colors`}
      className="brand-strip"
    >
      {brandColorTokens.map((item) => {
        const value = palette[item.token];
        const parsed = parseOklch(value);
        const hex = parsed ? oklchToHex(parsed).toUpperCase() : value;
        const checks = contrastChecks(palette, item.token);
        const low = checks.some((check) => check.ratio < check.minimum);
        const primary = item.token === "primary";
        return (
          <li
            className={
              primary ? "brand-swatch brand-swatch--primary" : "brand-swatch"
            }
            key={item.token}
            style={
              {
                "--swatch": value,
                "--swatch-ink": labelColor(value),
              } as CSSProperties
            }
          >
            <DialogTrigger>
              <AriaButton
                aria-label={`${item.label}, ${hex}${low ? ", low contrast" : ""}. Edit color`}
                className="brand-swatch-button"
                isDisabled={disabled}
              >
                <span className="brand-swatch-name">{item.label}</span>
                <span className="brand-swatch-hex">
                  {low ? "⚠ " : ""}
                  {hex}
                </span>
              </AriaButton>
              <Popover className="brand-swatch-popover" placement="bottom">
                <Dialog aria-label={`${item.label} color`}>
                  <OklchPicker
                    checks={checks}
                    description={item.description}
                    label={`${item.label} (--${item.token})`}
                    onChange={(next) => onChange(item.token, next)}
                    value={value}
                  />
                </Dialog>
              </Popover>
            </DialogTrigger>
            {primary && (
              <span aria-hidden="true" className="brand-swatch-tints">
                {tintSteps.map((step) => (
                  <span
                    key={step}
                    style={{
                      background: `color-mix(in oklch, ${value} ${100 - step}%, ${palette.surface})`,
                    }}
                  />
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
