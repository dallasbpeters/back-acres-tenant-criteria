import { LeaseSigner } from "@/components/management/lease-signer";
import { ManagementShell } from "@/components/management/shell";
export const dynamic = "force-dynamic";
export const metadata = {
  referrer: "no-referrer" as const,
  robots: { follow: false, index: false },
  title: "Review and sign your lease | Back Acres",
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
