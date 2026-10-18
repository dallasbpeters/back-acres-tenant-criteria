import { ManagementShell } from "@/components/management/shell";
import { LeaseSigner } from "@/components/management/lease-signer";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Review and sign your lease | Back Acres",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <ManagementShell title="Review and sign your lease">
      <LeaseSigner token={token} />
    </ManagementShell>
  );
}
