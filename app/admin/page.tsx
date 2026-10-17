import { authenticated } from "@/lib/adverse/auth";
import { OwnerFrame } from "@/components/management/owner-frame";
import { OwnerSignIn } from "@/components/management/sign-in";
import { Dashboard } from "@/components/management/dashboard";
export const dynamic = "force-dynamic";
export const metadata = { title: "Owner workspace | Back Acres" };
export default async function AdminPage() {
  const signedIn = await authenticated();
  return (
    <OwnerFrame title="Owner workspace" signedIn={signedIn}>
      {signedIn ? <Dashboard /> : <OwnerSignIn />}
    </OwnerFrame>
  );
}
