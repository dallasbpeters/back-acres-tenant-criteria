import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { listingPhotos, properties } from "@/lib/db/schema";
import { ManagementShell } from "@/components/management/shell";
import { dollars } from "@/lib/management/model";
export const dynamic = "force-dynamic";
export const metadata = { title: "Available properties | Back Acres" };
export default async function PropertiesPage() {
  const rows = await db().select().from(properties);
  const photos = await db()
    .select({ id: listingPhotos.id, propertyId: listingPhotos.propertyId })
    .from(listingPhotos)
    .where(eq(listingPhotos.archived, false))
    .orderBy(asc(listingPhotos.position), asc(listingPhotos.createdAt));
  const published = rows.filter((r) => r.data.published);
  return (
    <ManagementShell title="Our properties">
      <p className="hero-lede">
        Review the property details and selection criteria before applying.
      </p>
      <div className="property-list">
        {published.length ? (
          published.map((p) => (
            <article key={p.id}>
              {photos.find((photo) => photo.propertyId === p.id) && (
                <a
                  href={`/properties/${p.slug}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <img
                    className="property-cover"
                    src={`/api/photos/${photos.find((photo) => photo.propertyId === p.id)!.id}`}
                    alt=""
                    loading="lazy"
                  />
                </a>
              )}
              <h2>
                <a href={`/properties/${p.slug}`}>{p.data.name}</a>
              </h2>
              <p>{p.data.address}</p>
              <p>
                {dollars(p.data.rentCents)} / month · {p.data.bedrooms} bedrooms
                · {p.data.bathrooms} bathrooms
              </p>
              <p>
                {p.data.acceptingApplications
                  ? "Accepting applications"
                  : "Applications closed"}
              </p>
            </article>
          ))
        ) : (
          <p>No properties are currently listed. Please check back.</p>
        )}
      </div>
    </ManagementShell>
  );
}
