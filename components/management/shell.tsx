import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeControl } from "@/components/ui/theme";
export function ManagementShell({
  title,
  children,
  owner = false,
  hideHeading = false,
}: {
  title: string;
  children: ReactNode;
  owner?: boolean;
  hideHeading?: boolean;
}) {
  return (
    <>
      <header className="masthead">
        <div className="layout-width masthead-inner">
          <a className="brand" href="/properties">
            <BrandLogo />
            <span>
              <strong>Back Acres</strong>
              <small>Property management</small>
            </span>
          </a>
          <nav aria-label="Main navigation" className="management-nav">
            <a href="/properties">Properties</a>
            <ThemeControl />
            {!!owner && (
              <>
                <a href="/admin">Workspace</a>
                <a href="/admin/adverse-actions">Adverse-action notices</a>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="layout-width management-main">
        {!hideHeading && <h1>{title}</h1>}
        {children}
      </main>
    </>
  );
}
