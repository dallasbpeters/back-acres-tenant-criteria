import { notRemoved } from "@/lib/management/not-removed";
import { POLICY, selectionCriteriaText } from "@/lib/policy";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { ManagementShell } from "@/components/management/shell";
import { IntakeForm } from "@/components/management/intake";
export const dynamic = "force-dynamic";
export const metadata = { title: "Rental application | Back Acres" };
export default async function ApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [p] = await db()
    .select()
    .from(properties)
    .where(and(eq(properties.slug, slug), notRemoved(properties.id)));
  if (!p || !p.data.published) notFound();
  return (
    <ManagementShell title={`Apply · ${p.data.name}`}>
      <p>{p.data.address}</p>
      {p.data.acceptingApplications ? (
        <IntakeForm
          kind="application"
          property={{
            criteria: selectionCriteriaText(),
            criteriaVersion: POLICY.version,
            contact: p.data.contact,
            emergencyContact: "",
          }}
          propertyId={p.id}
          revision={p.revision}
        />
      ) : (
        <p>Applications are currently closed.</p>
      )}
    </ManagementShell>
  );
}
