import { notFound } from "next/navigation";
import { z } from "zod";
import { authenticated } from "@/lib/adverse/auth";
import { OwnerFrame } from "@/components/management/owner-frame";
import AdverseEditor from "@/components/adverse-editor";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Edit adverse-action notice | Back Acres",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  if (documentId !== "new" && !z.string().uuid().safeParse(documentId).success)
    notFound();
  const signedIn = await authenticated();
  return (
    <OwnerFrame
      title={
        documentId === "new"
          ? "New adverse-action notice"
          : "Adverse action notice"
      }
      signedIn={signedIn}
    >
      <AdverseEditor
        signedIn={signedIn}
        documentId={documentId === "new" ? undefined : documentId}
      />
    </OwnerFrame>
  );
}
