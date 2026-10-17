import type { ReactNode } from "react";
export function ManagementShell({
  title,
  children,
  owner = false,
}: {
  title: string;
  children: ReactNode;
  owner?: boolean;
}) {
  return (
    <>
      <header className="masthead">
        <div className="layout-width masthead-inner">
          <a className="brand" href="/properties">
            <span className="brand-monogram">BA</span>
            <span>
              <strong>Back Acres</strong>
              <small>Property management</small>
            </span>
          </a>
          <nav className="management-nav" aria-label="Main navigation">
            <a href="/properties">Properties</a>
            {owner && (
              <>
                <a href="/admin">Workspace</a>
                <a href="/admin/adverse-actions">Adverse-action notices</a>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="layout-width management-main">
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}
