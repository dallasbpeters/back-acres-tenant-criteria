// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type BrandColors,
  type BrandPalette,
  brandColorTokens,
  defaultBrandColors,
} from "@/lib/brand-colors";
import { BrandColorStrip } from "./brand-color-strip";
import { EmailTest } from "./email-test";
import { SectionCard } from "./section-card";

interface Brand {
  colors?: BrandColors;
  createdAt: string;
  hasColors?: boolean;
  hasLogo?: boolean;
  id: string;
  logoPng?: string | null;
  name: string;
}
export function BrandingWorkspace() {
  const [current, setCurrent] = useState<Brand | null>(null),
    [history, setHistory] = useState<Brand[]>([]),
    [name, setName] = useState("Back Acres Rental"),
    [colors, setColors] = useState<BrandColors>(defaultBrandColors),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const router = useRouter();
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/branding"),
      data = await r.json();
    if (!r.ok) {
      throw new Error(data.error);
    }
    setCurrent(data.current);
    setHistory(data.history);
    setName(data.current?.name ?? "Back Acres Rental");
    setColors(data.current?.colors ?? defaultBrandColors);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function save(data: FormData) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await fetch("/api/admin/branding", {
          body: data,
          method: "POST",
        }),
        result = await r.json();
      if (!r.ok) {
        throw new Error(result.error);
      }
      await load();
      window.dispatchEvent(new Event("branding-updated"));
      // Re-render the root layout so the saved colors apply everywhere.
      router.refresh();
      setMessage(
        "Branding saved. New signing packets and draft PDFs will use this version."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard className="branding-workspace" labelledBy="branding-heading">
      <h2 id="branding-heading">Branding</h2>
      <p>
        Your logo appears in the owner navbar, emails, and lease PDFs. Your
        colors apply to every page. Signed leases keep the branding used when
        their signing packet was created.
      </p>
      {!!error && <p role="alert">{error}</p>}
      {!!message && <p role="status">{message}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          await save(new FormData(form));
          form.reset();
        }}
      >
        <label className="field">
          Business name
          <input
            maxLength={120}
            name="name"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </label>
        {current?.logoPng ? (
          <Image
            alt={`${current.name} current logo`}
            className="branding-logo"
            height={800}
            src={`data:image/png;base64,${current.logoPng}`}
            unoptimized
            width={1200}
          />
        ) : (
          <p className="small-note">No logo uploaded yet.</p>
        )}
        <label className="field">
          Upload logo
          <input
            accept="image/png,image/svg+xml,.png,.svg"
            name="logo"
            type="file"
          />
        </label>
        <p className="small-note">
          PNG or SVG, up to 2 MB. Transparent backgrounds work well. SVG artwork
          is cleaned and converted for display and PDF export. External images,
          fonts, stylesheets, and scripts are removed; use self-contained
          artwork and export text as paths for best results.
        </p>
        <input name="colors" type="hidden" value={JSON.stringify(colors)} />
        <div className="brand-color-modes">
          {(["light", "dark"] as const).map((mode) => (
            <section
              aria-labelledby={`brand-colors-${mode}`}
              className="brand-color-mode"
              key={mode}
            >
              <div className="brand-color-mode-heading">
                <h3 id={`brand-colors-${mode}`}>
                  {mode === "light" ? "Light mode colors" : "Dark mode colors"}
                </h3>
                <Button
                  disabled={busy}
                  onClick={() =>
                    setColors((value) => ({
                      ...value,
                      [mode]: defaultBrandColors[mode],
                    }))
                  }
                  variant="quiet"
                >
                  Reset to defaults
                </Button>
              </div>
              <BrandColorStrip
                disabled={busy}
                mode={mode}
                onChange={(token, value) =>
                  setColors((previous) => ({
                    ...previous,
                    [mode]: { ...previous[mode], [token]: value },
                  }))
                }
                palette={colors[mode]}
              />
              <BrandPreview mode={mode} palette={colors[mode]} />
            </section>
          ))}
        </div>
        <div className="management-actions">
          <Button disabled={busy} type="submit" variant="primary">
            {busy ? "Saving…" : "Save branding"}
          </Button>
          {!!current?.logoPng && (
            <Button
              disabled={busy}
              onClick={() => {
                const data = new FormData();
                data.set("name", name);
                data.set("remove", "true");
                save(data);
              }}
              type="button"
            >
              Remove logo
            </Button>
          )}
        </div>
      </form>
      <EmailTest />
      {!!(history.length > 1) && (
        <details>
          <summary>Previous branding</summary>
          {history.slice(1).map((b) => (
            <div className="lease-history-row" key={b.id}>
              <span>
                {b.name} · {b.hasLogo ? "Logo" : "No logo"} ·{" "}
                {b.hasColors ? "Custom colors" : "Default colors"} ·{" "}
                {new Date(b.createdAt).toLocaleString()}
              </span>
              <Button
                disabled={busy}
                onClick={() => {
                  const data = new FormData();
                  data.set("name", b.name);
                  data.set("restore", b.id);
                  save(data);
                }}
                type="button"
              >
                Restore version
              </Button>
            </div>
          ))}
        </details>
      )}
    </SectionCard>
  );
}

function BrandPreview({
  mode,
  palette,
}: {
  mode: "dark" | "light";
  palette: BrandPalette;
}) {
  const style = Object.fromEntries(
    brandColorTokens.map(({ token }) => [`--${token}`, palette[token]])
  ) as CSSProperties;
  return (
    <div
      aria-label={`${mode === "light" ? "Light" : "Dark"} mode preview`}
      className="brand-preview"
      role="img"
      style={style}
    >
      <p className="brand-preview-title">Tenant selection criteria</p>
      <p className="brand-preview-body">
        Body text on the page surface.{" "}
        <span className="brand-preview-accent">Accent label</span>
      </p>
      <p className="brand-preview-status">
        <span className="brand-preview-danger">Error message</span>
        <span className="brand-preview-warning">Warning message</span>
      </p>
      <span className="brand-preview-button">Action button</span>
      <span className="brand-preview-secondary" />
    </div>
  );
}
