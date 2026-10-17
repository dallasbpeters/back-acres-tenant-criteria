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
  return (
    <AdverseEditor
      signedIn={await authenticated()}
      loginError={
        error
          ? error === "AccessDenied"
            ? "AccessDenied"
            : "SignInError"
          : undefined
      }
    />
  );
}
