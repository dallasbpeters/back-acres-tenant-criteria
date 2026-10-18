// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Brand {
  createdAt: string;
  hasLogo?: boolean;
  id: string;
  logoPng?: string | null;
  name: string;
}
export function BrandingWorkspace() {
  const [current, setCurrent] = useState<Brand | null>(null),
    [history, setHistory] = useState<Brand[]>([]),
    [name, setName] = useState("Back Acres Rental"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/branding"),
      data = await r.json();
    if (!r.ok) {
      throw new Error(data.error);
    }
    setCurrent(data.current);
    setHistory(data.history);
    setName(data.current?.name ?? "Back Acres Rental");
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
    <section className="branding-workspace">
      <h2>Branding</h2>
      <p>
        Your logo appears in the owner navbar and lease PDFs. Signed leases keep
        the branding used when their signing packet was created.
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
          is converted safely for display and PDF export; export text as paths
          for best results.
        </p>
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
      {!!(history.length > 1) && (
        <details>
          <summary>Previous branding</summary>
          {history.slice(1).map((b) => (
            <div className="lease-history-row" key={b.id}>
              <span>
                {b.name} · {b.hasLogo ? "Logo" : "No logo"} ·{" "}
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
    </section>
  );
}
