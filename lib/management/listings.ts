import { amenityOptions } from "./amenities";
import { dollars, type PropertyInput } from "./model";
export const listingProviders = [
  {
    id: "zillow",
    name: "Zillow Rental Manager",
    url: "https://www.zillow.com/rental-manager/",
    coverage: "Zillow, Trulia, and HotPads",
    source: "https://www.zillow.com/rentals-network/",
  },
  {
    id: "avail",
    name: "Avail",
    url: "https://www.avail.com/landlords/rental-listings",
    coverage: "Realtor.com and the Avail syndication network",
    source: "https://www.realtor.com/landlords/list-rental-property",
  },
  {
    id: "apartments",
    name: "Apartments.com",
    url: "https://www.apartments.com/rental-manager",
    coverage: "Apartments.com network, including Homes.com",
    source: "https://www.apartments.com/rental-manager",
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
