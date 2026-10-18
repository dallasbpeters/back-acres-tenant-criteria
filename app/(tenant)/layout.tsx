import type { ReactNode } from "react";
import { TenantProvider } from "@/components/tenant/provider";
import { tenantAuthReady } from "@/lib/tenant/config";
export default function TenantLayout({ children }: { children: ReactNode }) {
  return tenantAuthReady() ? (
    <TenantProvider>{children}</TenantProvider>
  ) : (
    children
  );
}
