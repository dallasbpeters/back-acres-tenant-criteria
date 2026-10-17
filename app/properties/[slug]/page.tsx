import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { ManagementShell } from "@/components/management/shell";
import { dollars } from "@/lib/management/model";
export const dynamic = "force-dynamic";
export default async function PropertyPage({
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
    <ManagementShell title={p.data.name}>
      <p>{p.data.address}</p>
      <dl className="document-details">
        <div>
          <dt>Monthly rent</dt>
          <dd>{dollars(p.data.rentCents)}</dd>
        </div>
        <div>
          <dt>Bedrooms / bathrooms</dt>
          <dd>
            {p.data.bedrooms} / {p.data.bathrooms}
          </dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{p.data.availableDate || "Contact owner"}</dd>
        </div>
      </dl>
      <section className="management-section">
        <h2>About this property</h2>
        <p className="document-text">{p.data.description}</p>
      </section>
      <section className="management-section">
        <h2>Selection criteria</h2>
        <p>{p.data.criteriaVersion}</p>
        <p className="document-text">{p.data.criteria}</p>
      </section>
      <p>Questions: {p.data.contact}</p>
      {p.data.acceptingApplications ? (
        <a className="submit-button" href={`/properties/${p.slug}/apply`}>
          Apply for this property
        </a>
      ) : (
        <p>Applications are currently closed.</p>
      )}
    </ManagementShell>
  );
}
