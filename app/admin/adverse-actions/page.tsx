import { AdverseList } from "@/components/adverse-list";
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
  searchParams: Promise<{ error?: string; q?: string; status?: string }>;
}) {
  const { error, q, status } = await searchParams;
  const signedIn = await authenticated();
  return (
    <OwnerFrame title="Adverse action notices" signedIn={signedIn}>
      {signedIn ? (
        <AdverseList
          initialQuery={q?.slice(0, 200) ?? ""}
          initialStatus={status}
        />
      ) : (
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
      )}
    </OwnerFrame>
  );
}
