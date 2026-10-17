import { eq } from "drizzle-orm";
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
    .where(eq(properties.slug, slug));
  if (!p || !p.data.published) notFound();
  return (
    <ManagementShell title={`Apply · ${p.data.name}`}>
      <p>{p.data.address}</p>
      {p.data.acceptingApplications ? (
        <IntakeForm
          kind="application"
          property={{
            criteria: p.data.criteria,
            criteriaVersion: p.data.criteriaVersion,
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
