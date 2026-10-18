// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { type ReactNode, useEffect, useState } from "react";
import { BrandLogoImage, useBranding } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ThemeControl } from "@/components/ui/theme";
import { ownerSections } from "./navigation";
export function OwnerFrame({
  title,
  signedIn,
  children,
}: {
  title: string;
  signedIn: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname(),
    [section, setSection] = useState("properties"),
    [leaving, setLeaving] = useState(false),
    brand = useBranding();
  useEffect(() => {
    const update = () =>
      setSection(window.location.hash.slice(1) || "properties");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return (
    <div className="owner-app">
      <header className="owner-navbar">
        <a className="owner-brand" href="/admin">
          <BrandLogoImage brand={brand} />
          <span>
            {brand.name}
            <small>Property management</small>
          </span>
        </a>
        <nav aria-label="Account navigation">
          {!!signedIn && (
            <a href="/admin">
              <Icon name="home" size={18} />
              Workspace
            </a>
          )}
          <a href="/properties" rel="noreferrer" target="_blank">
            View site ↗
          </a>
          <ThemeControl />
          {!!signedIn && (
            <Button
              disabled={leaving}
              onClick={async () => {
                if (
                  !window.dispatchEvent(
                    new Event("owner-sign-out", { cancelable: true })
                  )
                ) {
                  return;
                }
                setLeaving(true);
                try {
                  await signOut({ callbackUrl: "/admin" });
                } catch {
                  setLeaving(false);
                }
              }}
              type="submit"
            >
              <Icon name="signout" size={18} />
              {leaving ? "Signing out…" : "Sign out"}
            </Button>
          )}
        </nav>
      </header>
      <div className={`owner-layout ${signedIn ? "" : "owner-signed-out"}`}>
        {!!signedIn && (
          <aside className="owner-sidebar">
            <p className="nav-label">Workspace</p>
            <nav aria-label="Workspace sections">
              {ownerSections.map((s) => (
                <a
                  aria-current={
                    pathname === "/admin" && section === s.key
                      ? "page"
                      : undefined
                  }
                  href={`/admin#${s.key}`}
                  key={s.key}
                >
                  {s.label}
                </a>
              ))}
              <div className="nav-divider" />
              <a
                aria-current={
                  pathname.startsWith("/admin/adverse-actions")
                    ? "page"
                    : undefined
                }
                href="/admin/adverse-actions"
              >
                Adverse-action notices
              </a>
              <a href="/#criteria" rel="noreferrer" target="_blank">
                Selection criteria ↗
              </a>
            </nav>
          </aside>
        )}
        <main className="owner-main management-main">
          <div className="owner-page-heading">
            <p className="eyebrow">
              Back Acres /{" "}
              {pathname.includes("adverse-actions")
                ? "Correspondence"
                : "Management"}
            </p>
            <h1>{title}</h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
