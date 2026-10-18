import { Icon } from "@/components/ui/icon";
import { PropertyAmenities } from "@/components/management/amenities";
import { availabilityDate } from "@/lib/management/display";
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
        <Icon name="back" size={18} /> All properties
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
        <div className="property-heading-title">
          <p className="property-status">
            <span aria-hidden="true" />
            {p.data.acceptingApplications
              ? "Accepting applications"
              : "Applications closed"}
          </p>
          <h1>{p.data.name}</h1>
          <p className="property-address">{p.data.address}</p>
        </div>
        <div className="property-heading-summary">
          <p className="property-price">
            {dollars(p.data.rentCents)}
            <span> / month</span>
          </p>
          <p>
            {p.data.bedrooms} beds <span aria-hidden="true">·</span>{" "}
            {p.data.bathrooms} baths
          </p>
        </div>
      </header>
      <nav className="property-section-nav" aria-label="Property information">
        <a href="#property-overview">Overview</a>
        <a href="#property-photos">Photos</a>
        <a href="#property-about">About</a>
        {!!p.data.amenities?.length && (
          <a href="#property-amenities">Amenities</a>
        )}
        <a href="#property-criteria">Selection criteria</a>
        <a href="#property-contact">Contact & apply</a>
      </nav>
      <div className="property-content-layout">
        <div>
          <section
            id="property-overview"
            className="property-overview"
            aria-label="Property overview"
          >
            <dl className="property-overview-grid">
              <div>
                <dt>
                  <Icon name="bed" size={22} />
                  Bedrooms
                </dt>
                <dd>
                  {p.data.bedrooms}
                  <span>bedrooms</span>
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="bath" size={22} />
                  Bathrooms
                </dt>
                <dd>
                  {p.data.bathrooms}
                  <span>bathrooms</span>
                </dd>
              </div>
              <div className="property-overview-date">
                <dt>
                  <Icon name="calendar" size={22} />
                  Available from
                </dt>
                <dd>{availabilityDate(p.data.availableDate)}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="money" size={22} />
                  Monthly rent
                </dt>
                <dd>
                  {dollars(p.data.rentCents)}
                  <span>per month</span>
                </dd>
              </div>
            </dl>
          </section>
          <section id="property-about" className="property-content-section">
            <h2>About this property</h2>
            <PropertyDescription text={p.data.description} grid />
          </section>
          <PropertyAmenities selected={p.data.amenities} />
          <section
            id="property-criteria"
            className="property-content-section property-criteria-section"
          >
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
          <div className="property-apply-heading">
            <p className="eyebrow">Back Acres Rental</p>
            <h2>Interested in this home?</h2>
            <p>Available {availabilityDate(p.data.availableDate)}</p>
          </div>
          {p.data.acceptingApplications ? (
            <a className="submit-button" href={`/properties/${p.slug}/apply`}>
              Apply for this property <Icon name="next" />
            </a>
          ) : (
            <p>Applications are currently closed.</p>
          )}
          <div className="property-contact-detail">
            <span className="eyebrow">Property contact</span>
            <p>{p.data.contact}</p>
          </div>
          <a
            className="property-location-link"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.data.address)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="location" />
            View location
            <Icon name="external" size={16} />
          </a>
          <a href="#property-criteria">Review selection criteria</a>
        </aside>
      </div>
    </ManagementShell>
  );
}
