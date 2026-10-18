import { notRemoved } from "@/lib/management/not-removed";
import { ListingGallery } from "@/components/management/listing-gallery";
import { POLICY, selectionCriteriaText } from "@/lib/policy";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
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
    .where(and(eq(properties.slug, slug), notRemoved(properties.id)));
  if (!p || !p.data.published) notFound();
  const photos = await db()
    .select({ id: listingPhotos.id, caption: listingPhotos.caption })
    .from(listingPhotos)
    .where(
      and(
        eq(listingPhotos.propertyId, p.id),
        eq(listingPhotos.archived, false),
      ),
    )
    .orderBy(asc(listingPhotos.position), asc(listingPhotos.createdAt));
  return (
    <ManagementShell title={p.data.name}>
      <p>{p.data.address}</p>
      <ListingGallery
        name={p.data.name}
        photos={photos.map((p) => ({ ...p, url: `/api/photos/${p.id}` }))}
      />
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
        <p>{POLICY.version}</p>
        <p className="document-text">{selectionCriteriaText()}</p>
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
