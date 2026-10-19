"use client";
import { UserButton } from "@clerk/nextjs";
export function TenantNavigation() {
  return (
    <nav aria-label="Tenant navigation" className="tenant-navigation">
      <a href="/tenant">Overview</a>
      <a href="/tenant#leases">Leases</a>
      <a href="/tenant#insurance">Insurance</a>
      <a href="/tenant#payments">Payments</a>
      <a href="/tenant/maintenance">Maintenance</a>
      <a href="/tenant/settings">Account settings</a>
      <UserButton />
    </nav>
  );
}
