import { notFound } from "next/navigation";
import { z } from "zod";
import AdverseEditor from "@/components/adverse-editor";
import { OwnerFrame } from "@/components/management/owner-frame";
import { authenticated } from "@/lib/adverse/auth";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { follow: false, index: false },
  title: "Edit adverse-action notice | Back Acres",
};
export default async function Page({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  if (
    documentId !== "new" &&
    !z.string().uuid().safeParse(documentId).success
  ) {
    notFound();
  }
  const signedIn = await authenticated();
  return (
    <OwnerFrame
      signedIn={signedIn}
      title={
        documentId === "new"
          ? "New adverse-action notice"
          : "Adverse action notice"
      }
    >
      <AdverseEditor
        documentId={documentId === "new" ? undefined : documentId}
        signedIn={signedIn}
      />
    </OwnerFrame>
  );
}
