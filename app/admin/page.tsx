import type { Metadata } from "next";
import { Dashboard } from "@/components/management/dashboard";
import { OwnerFrame } from "@/components/management/owner-frame";
import { OwnerSignIn } from "@/components/management/sign-in";
import { authenticated } from "@/lib/adverse/auth";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner workspace | Back Acres" };
export default async function AdminPage() {
  const signedIn = await authenticated();
  return (
    <OwnerFrame signedIn={signedIn} title="Owner workspace">
      {signedIn ? <Dashboard /> : <OwnerSignIn />}
    </OwnerFrame>
  );
}
