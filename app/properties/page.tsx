import { asc, eq } from "drizzle-orm";
import { ListingGallery } from "@/components/management/listing-gallery";
import { PropertyDescription } from "@/components/management/property-description";
import { ManagementShell } from "@/components/management/shell";
import { Icon } from "@/components/ui/icon";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
import { dollars } from "@/lib/management/model";
import { notRemoved } from "@/lib/management/not-removed";
export const dynamic = "force-dynamic";
export const metadata = { title: "Available properties | Back Acres" };
export default async function PropertiesPage() {
  const rows = await db()
    .select()
    .from(properties)
    .where(notRemoved(properties.id));
  const photos = await db()
    .select({
      caption: listingPhotos.caption,
      id: listingPhotos.id,
      propertyId: listingPhotos.propertyId,
    })
    .from(listingPhotos)
    .where(eq(listingPhotos.archived, false))
    .orderBy(asc(listingPhotos.position), asc(listingPhotos.createdAt));
  const published = rows.filter((r) => r.data.published);
  return (
    <ManagementShell title="Our properties">
      <p className="hero-lede">
        Review the property details and selection criteria before applying.
      </p>
      <div className="property-list property-list--grid">
        {published.length ? (
          published.map((p) => (
            <article className="property-listing" key={p.id}>
              <ListingGallery
                name={p.data.name}
                photos={photos
                  .filter((photo) => photo.propertyId === p.id)
                  .map((photo) => ({
                    ...photo,
                    url: `/api/photos/${photo.id}`,
                  }))}
              />
              <div className="property-listing-info">
                <h2>
                  <a href={`/properties/${p.slug}`}>{p.data.name}</a>
                </h2>
                <p>{p.data.address}</p>
                <p>
                  {dollars(p.data.rentCents)} / month · {p.data.bedrooms}{" "}
                  bedrooms · {p.data.bathrooms} bathrooms
                </p>
                <p>
                  {p.data.acceptingApplications
                    ? "Accepting applications"
                    : "Applications closed"}
                </p>
                <a
                  className="property-details-link"
                  href={`/properties/${p.slug}`}
                >
                  View property details <Icon name="next" size={18} />
                </a>
              </div>
              <section className="property-about">
                <h3>About this property</h3>
                <PropertyDescription grid text={p.data.description} />
              </section>
            </article>
          ))
        ) : (
          <p>No properties are currently listed. Please check back.</p>
        )}
      </div>
    </ManagementShell>
  );
}
