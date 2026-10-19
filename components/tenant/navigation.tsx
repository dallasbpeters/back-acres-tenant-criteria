"use client";
import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const tabs = [
  { hash: "", href: "/tenant", label: "Overview", path: "/tenant" },
  { hash: "#leases", href: "/tenant#leases", label: "Leases", path: "/tenant" },
  {
    hash: "#insurance",
    href: "/tenant#insurance",
    label: "Insurance",
    path: "/tenant",
  },
  {
    hash: "#payments",
    href: "/tenant#payments",
    label: "Payments",
    path: "/tenant",
  },
  {
    hash: "",
    href: "/tenant/maintenance",
    label: "Maintenance",
    path: "/tenant/maintenance",
  },
  {
    hash: "",
    href: "/tenant/settings",
    label: "Account settings",
    path: "/tenant/settings",
  },
];

/** Tenant portal tabs; the current page (and section) is marked for screen readers. */
export function TenantNavigation() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const current = (tab: (typeof tabs)[number]) =>
    pathname.startsWith("/tenant/settings")
      ? tab.path === "/tenant/settings"
      : tab.path === pathname && tab.hash === hash;
  return (
    <nav aria-label="Tenant navigation" className="tenant-navigation">
      <ul className="tenant-tabs">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <a
              aria-current={current(tab) ? "page" : undefined}
              className="tenant-tab"
              href={tab.href}
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
      <UserButton />
    </nav>
  );
}
