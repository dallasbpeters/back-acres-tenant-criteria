import { SignUp } from "@clerk/nextjs";
import { ManagementShell } from "@/components/management/shell";
import { tenantAuthReady } from "@/lib/tenant/config";
export const metadata = { title: "Create tenant account | Back Acres" };
export default function SignUpPage() {
  return (
    <ManagementShell title="Create your tenant account">
      <p>
        Use an email you check, or continue with Google. If you came here after
        signing your lease, the lease is added to your account automatically.
        Otherwise the property owner connects your tenancy.
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
