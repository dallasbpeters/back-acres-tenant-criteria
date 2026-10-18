"use client";
import { BrandLogoImage, useBranding } from "@/components/brand-logo";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

import { ThemeControl } from "@/components/ui/theme";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
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
          {signedIn && (
            <a href="/admin">
              <Icon name="home" size={18} />
              Workspace
            </a>
          )}
          <a href="/properties" target="_blank" rel="noreferrer">
            View site ↗
          </a>
          <ThemeControl />
          {signedIn && (
            <Button
              type="submit"
              disabled={leaving}
              onClick={async () => {
                if (
                  !window.dispatchEvent(
                    new Event("owner-sign-out", { cancelable: true }),
                  )
                )
                  return;
                setLeaving(true);
                try {
                  await signOut({ callbackUrl: "/admin" });
                } catch {
                  setLeaving(false);
                }
              }}
            >
              <Icon name="signout" size={18} />
              {leaving ? "Signing out…" : "Sign out"}
            </Button>
          )}
        </nav>
      </header>
      <div className={`owner-layout ${!signedIn ? "owner-signed-out" : ""}`}>
        {signedIn && (
          <aside className="owner-sidebar">
            <p className="nav-label">Workspace</p>
            <nav aria-label="Workspace sections">
              {ownerSections.map((s) => (
                <a
                  key={s.key}
                  href={`/admin#${s.key}`}
                  aria-current={
                    pathname === "/admin" && section === s.key
                      ? "page"
                      : undefined
                  }
                >
                  {s.label}
                </a>
              ))}
              <div className="nav-divider" />
              <a
                href="/admin/adverse-actions"
                aria-current={
                  pathname.startsWith("/admin/adverse-actions")
                    ? "page"
                    : undefined
                }
              >
                Adverse-action notices
              </a>
              <a href="/#criteria" target="_blank" rel="noreferrer">
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
