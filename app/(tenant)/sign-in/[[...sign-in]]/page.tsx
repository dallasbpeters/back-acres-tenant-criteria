import { SignIn } from "@clerk/nextjs";
import { ManagementShell } from "@/components/management/shell";
import { tenantAuthReady } from "@/lib/tenant/config";
export const metadata = { title: "Tenant sign in | Back Acres" };
export default function SignInPage() {
  return (
    <ManagementShell title="Tenant sign in">
      <div className="tenant-auth">
        {tenantAuthReady() ? (
          <SignIn
            fallbackRedirectUrl="/tenant"
            path="/sign-in"
            routing="path"
            signUpUrl="/sign-up"
          />
        ) : (
          <p>
            Tenant sign-in is being configured. Existing payment and maintenance
            links still work.
          </p>
        )}
      </div>
    </ManagementShell>
  );
}
