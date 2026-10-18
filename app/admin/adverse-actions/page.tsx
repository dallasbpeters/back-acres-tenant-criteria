import AdverseEditor from "@/components/adverse-editor";
import { AdverseList } from "@/components/adverse-list";
import { OwnerFrame } from "@/components/management/owner-frame";
import { authenticated } from "@/lib/adverse/auth";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { follow: false, index: false },
  title: "Adverse Action Notices | Back Acres Rental",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const { error, q, status } = await searchParams;
  const signedIn = await authenticated();
  const resolveLoginError1 = () => {
    if (error) {
      if (error === "AccessDenied") {
        return "AccessDenied";
      }
      return "SignInError";
    }
  };
  return (
    <OwnerFrame signedIn={signedIn} title="Adverse action notices">
      {signedIn ? (
        <AdverseList
          initialQuery={q?.slice(0, 200) ?? ""}
          initialStatus={status}
        />
      ) : (
        <AdverseEditor loginError={resolveLoginError1()} signedIn={signedIn} />
      )}
    </OwnerFrame>
  );
}
