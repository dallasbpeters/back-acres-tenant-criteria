import { OwnerFrame } from "@/components/management/owner-frame";
import AdverseEditor from "@/components/adverse-editor";
import { authenticated } from "@/lib/adverse/auth";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Adverse Action Notices | Back Acres Rental",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const signedIn = await authenticated();
  return (
    <OwnerFrame title="Adverse action notices" signedIn={signedIn}>
      <AdverseEditor
        signedIn={signedIn}
        loginError={
          error
            ? error === "AccessDenied"
              ? "AccessDenied"
              : "SignInError"
            : undefined
        }
      />
    </OwnerFrame>
  );
}
