import { SignUp } from "@clerk/nextjs";
import { ManagementShell } from "@/components/management/shell";
import { tenantAuthReady } from "@/lib/tenant/config";
export const metadata = { title: "Create tenant account | Back Acres" };
export default function SignUpPage() {
  return (
    <ManagementShell title="Create your tenant account">
      <p>
        Use the email you gave the property owner. The owner must approve your
        tenancy before property records become available.
      </p>
      <div className="tenant-auth">
        {tenantAuthReady() ? (
          <SignUp
            fallbackRedirectUrl="/tenant"
            path="/sign-up"
            routing="path"
            signInUrl="/sign-in"
          />
        ) : (
          <p>Tenant accounts are being configured.</p>
        )}
      </div>
    </ManagementShell>
  );
}
