import { UserProfile } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { ManagementShell } from "@/components/management/shell";
import { TenantContactForm } from "@/components/tenant/contact-form";
import { TenantNavigation } from "@/components/tenant/navigation";
import { assignments, tenantIdentity } from "@/lib/tenant/access";
export const metadata = { title: "Tenant account settings | Back Acres" };
export const dynamic = "force-dynamic";
export default async function TenantSettings() {
  const userId = await tenantIdentity();
  if (!userId) {
    redirect("/sign-in");
  }
  const accessRows = await assignments(userId).catch(() => []);
  return (
    <ManagementShell title="Account settings">
      <TenantNavigation />
      <p>
        Manage how you sign in: your phone number, email, password and security.
        Your rental stays connected if you change any of them.
      </p>
      {accessRows.map((access) => (
        <TenantContactForm
          id={access.id}
          key={access.id}
          name={access.name}
          phone={access.phone}
        />
      ))}
      <UserProfile path="/tenant/settings" routing="path" />
    </ManagementShell>
  );
}
