import "server-only";
import { createHash } from "node:crypto";
import type { PropertyInput } from "./model";
export function listingDigest(
  data: PropertyInput,
  photos: { id: string; caption: string }[]
) {
  const { emergencyContact, criteria, criteriaVersion, ...listing } = data;
  return createHash("sha256")
    .update(JSON.stringify({ listing, photos }))
    .digest("hex");
}
