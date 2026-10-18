import { OwnerFrame } from "@/components/management/owner-frame";
import { OwnerSignIn } from "@/components/management/sign-in";
import { TenantAccessManager } from "@/components/tenant/access-manager";
import { authenticated } from "@/lib/adverse/auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Tenant access | Back Acres" };
export default async function TenantAccessPage() {
  const signedIn = await authenticated();
  return (
    <OwnerFrame signedIn={signedIn} title="Tenant access">
      {signedIn ? <TenantAccessManager /> : <OwnerSignIn />}
    </OwnerFrame>
  );
}
