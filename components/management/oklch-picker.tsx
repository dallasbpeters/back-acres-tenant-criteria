// biome-ignore-all lint/performance/noJsxPropsBind: Native range and text inputs are not memoized app children; local callbacks intentionally capture the current color.
"use client";
import { type CSSProperties, useId, useState } from "react";
import {
  type ContrastCheck,
  formatOklch,
  inSrgbGamut,
  normalizeColorInput,
  type Oklch,
  oklchToHex,
  parseOklch,
} from "@/lib/brand-colors";

const maximumChroma = 0.37;
const hueStops = [0, 60, 120, 180, 240, 300, 360];

interface OklchPickerProps {
  checks: ContrastCheck[];
  description: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

function tracks({ c, h, l }: Oklch) {
  const lightness = `${(l * 100).toFixed(2)}%`;
  return {
    c: `linear-gradient(to right in oklch, oklch(${lightness} 0 ${h}), oklch(${lightness} ${maximumChroma} ${h}))`,
    h: `linear-gradient(to right in oklch, ${hueStops.map((stop) => `oklch(${lightness} ${c} ${stop})`).join(", ")})`,
    l: `linear-gradient(to right in oklch, oklch(0% ${c} ${h}), oklch(100% ${c} ${h}))`,
  };
}

export function OklchPicker({
  checks,
  description,
  label,
  onChange,
  value,
}: OklchPickerProps) {
  const id = useId();
  const color = parseOklch(value) ?? { c: 0, h: 0, l: 0 };
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && normalizeColorInput(draft) === null;
  const track = tracks(color);
  const update = (patch: Partial<Oklch>) => {
    setDraft(null);
    onChange(formatOklch({ ...color, ...patch }));
  };
  const commit = () => {
    const normalized = draft === null ? null : normalizeColorInput(draft);
    if (normalized) {
      onChange(normalized);
      setDraft(null);
    }
  };
  const sliders = [
    {
      key: "l" as const,
      label: "Lightness",
      max: 100,
      step: 0.1,
      text: `${(color.l * 100).toFixed(1)}%`,
      value: color.l * 100,
    },
    {
      key: "c" as const,
      label: "Chroma",
      max: maximumChroma,
      step: 0.001,
      text: color.c.toFixed(3),
      value: color.c,
    },
    {
      key: "h" as const,
      label: "Hue",
      max: 359.9,
      step: 0.5,
      text: `${color.h.toFixed(1)}°`,
      value: color.h,
    },
  ];

  return (
    <fieldset className="color-picker">
      <legend>{label}</legend>
      <div className="color-picker-heading">
        <span
          aria-hidden="true"
          className="color-picker-swatch"
          style={{ background: value }}
        />
        <p className="color-picker-description">{description}</p>
      </div>
      {sliders.map((slider) => (
        <label className="color-picker-slider" key={slider.key}>
          <span>
            {slider.label} <output>{slider.text}</output>
          </span>
          <input
            aria-valuetext={slider.text}
            max={slider.max}
            min={0}
            onChange={(event) => {
              const next = Number(event.target.value);
              update({ [slider.key]: slider.key === "l" ? next / 100 : next });
            }}
            step={slider.step}
            style={{ "--track": track[slider.key] } as CSSProperties}
            type="range"
            value={slider.value}
          />
        </label>
      ))}
      <label className="field color-picker-value">
        OKLCH or hex value
        <input
          aria-describedby={invalid ? `${id}-error` : undefined}
          aria-invalid={invalid}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          spellCheck={false}
          value={draft ?? value}
        />
      </label>
      {invalid ? (
        <p className="color-picker-error" id={`${id}-error`}>
          Enter oklch(L% C H) or a hex color such as #103e35.
        </p>
      ) : null}
      <p className="color-picker-meta">
        sRGB {oklchToHex(color)}
        {inSrgbGamut(color)
          ? ""
          : " · Outside the sRGB range; most screens show the nearest color."}
      </p>
      {checks.map((check) => {
        const passes = check.ratio >= check.minimum;
        return (
          <p
            className={`color-picker-contrast${passes ? "" : "color-picker-contrast--low"}`}
            key={check.against}
          >
            {passes ? "Contrast" : "Low contrast"}: {check.ratio.toFixed(2)}:1
            against {check.against} (needs {check.minimum}:1)
          </p>
        );
      })}
    </fieldset>
  );
}
