import { PropertyDescription } from "@/components/management/property-description";
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
    <ManagementShell title={p.data.name} hideHeading>
      <a className="property-back" href="/properties">
        ← All properties
      </a>
      <div id="property-photos">
        <ListingGallery
          name={p.data.name}
          photos={photos.map((photo) => ({
            ...photo,
            url: `/api/photos/${photo.id}`,
          }))}
        />
      </div>
      <header className="property-heading">
        <p className="eyebrow">Back Acres / Rental property</p>
        <h1>{p.data.name}</h1>
        <p>{p.data.address}</p>
      </header>
      <nav className="property-section-nav" aria-label="Property information">
        <a href="#property-photos">Photos</a>
        <a href="#property-about">About</a>
        <a href="#property-criteria">Selection criteria</a>
        <a href="#property-contact">Contact & apply</a>
      </nav>
      <div className="property-content-layout">
        <div>
          <dl className="document-details property-facts">
            <div>
              <dt>Monthly rent</dt>
              <dd>{dollars(p.data.rentCents)}</dd>
            </div>
            <div>
              <dt>Bedrooms</dt>
              <dd>{p.data.bedrooms}</dd>
            </div>
            <div>
              <dt>Bathrooms</dt>
              <dd>{p.data.bathrooms}</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{p.data.availableDate || "Contact owner"}</dd>
            </div>
          </dl>
          <section id="property-about" className="management-section">
            <h2>About this property</h2>
            <PropertyDescription text={p.data.description} />
          </section>
          <section id="property-criteria" className="management-section">
            <h2>Selection criteria</h2>
            <p>{POLICY.version}</p>
            <p className="document-text">{selectionCriteriaText()}</p>
          </section>
        </div>
        <aside
          id="property-contact"
          className="property-apply"
          aria-label="Contact and application"
        >
          <p className="eyebrow">Rental details</p>
          <h2>
            {dollars(p.data.rentCents)} <span>/ month</span>
          </h2>
          <p>
            {p.data.bedrooms} bedrooms · {p.data.bathrooms} bathrooms
          </p>
          <p>Available: {p.data.availableDate || "Contact owner"}</p>
          {p.data.acceptingApplications ? (
            <a className="submit-button" href={`/properties/${p.slug}/apply`}>
              Apply for this property <span aria-hidden="true">→</span>
            </a>
          ) : (
            <p>Applications are currently closed.</p>
          )}
          <p className="property-contact-detail">Questions? {p.data.contact}</p>
          <a href="#property-criteria">Review selection criteria</a>
        </aside>
      </div>
    </ManagementShell>
  );
}
