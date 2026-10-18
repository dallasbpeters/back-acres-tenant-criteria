import { amenityOptions } from "./amenities";
import { dollars, type PropertyInput } from "./model";
export const listingProviders = [
  {
    coverage: "Zillow, Trulia, and HotPads",
    id: "zillow",
    name: "Zillow Rental Manager",
    source: "https://www.zillow.com/rentals-network/",
    url: "https://www.zillow.com/rental-manager/",
  },
  {
    coverage: "Realtor.com and the Avail syndication network",
    id: "avail",
    name: "Avail",
    source: "https://www.realtor.com/landlords/list-rental-property",
    url: "https://www.avail.com/landlords/rental-listings",
  },
  {
    coverage: "Apartments.com network, including Homes.com",
    id: "apartments",
    name: "Apartments.com",
    source: "https://www.apartments.com/rental-manager",
    url: "https://www.apartments.com/rental-manager",
  },
] as const;
export function listingText(data: PropertyInput, slug: string, origin: string) {
  return [
    `${data.name}\n${data.address}`,
    `${dollars(data.rentCents)} / month · ${data.bedrooms} bedrooms · ${data.bathrooms} bathrooms`,
    `Available: ${data.availableDate || "Contact owner"}`,
    data.description,
    ...(data.amenities?.length
      ? [
          `Amenities: ${amenityOptions
            .filter((a) => data.amenities?.includes(a.id))
            .map((a) => a.label)
            .join(", ")}`,
        ]
      : []),
    `Contact: ${data.contact}`,
    `Listing: ${origin}/properties/${slug}`,
    `Apply: ${origin}/properties/${slug}/apply`,
    `Selection criteria: ${origin}/#criteria`,
  ].join("\n\n");
}
