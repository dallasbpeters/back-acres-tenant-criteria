import { notRemoved } from "@/lib/management/not-removed";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { properties, residentLinks } from "@/lib/db/schema";
import { tokenId } from "@/lib/management/security";
import { ManagementShell } from "@/components/management/shell";
import { IntakeForm } from "@/components/management/intake";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Maintenance request | Back Acres",
  referrer: "no-referrer" as const,
};
export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = tokenId("maintenance", token);
  if (!id) notFound();
  const [link] = await db()
    .select()
    .from(residentLinks)
    .where(and(eq(residentLinks.id, id), notRemoved(residentLinks.id)));
  if (!link || link.revoked || link.expiresAt.getTime() < Date.now())
    notFound();
  const [p] = await db()
    .select()
    .from(properties)
    .where(and(eq(properties.id, link.propertyId), notRemoved(properties.id)));
  if (!p) notFound();
  return (
    <ManagementShell title="Request maintenance">
      <p>
        {p.data.name} · {p.data.address}
      </p>
      <IntakeForm kind="maintenance" property={p.data} token={token} />
    </ManagementShell>
  );
}
