import type { TrackedRentalListing } from "@/lib/types";
import { fetchSrealityListingDetailUrls } from "@/lib/server/sreality-search";
import type { OccupancyCitySlug } from "./cities";
import { registryBreakdownListings } from "./breakdown-listings";
import {
  DEFAULT_OCCUPANCY_OPERATION,
  DEFAULT_OCCUPANCY_PORTAL,
  type OccupancyOperation,
  type OccupancyPortal,
} from "./constants";
import { listingUrlMapFromRentCache } from "./listings-preview";

export async function buildBreakdownListings(
  listings: Record<string, TrackedRentalListing>,
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
  options?: { resolveMissingUrls?: boolean; slim?: boolean },
): Promise<TrackedRentalListing[]> {
  const resolveMissingUrls = options?.resolveMissingUrls ?? true;
  const slim = options?.slim ?? false;
  const [base, urlById] = await Promise.all([
    Promise.resolve(registryBreakdownListings(listings, citySlug)),
    listingUrlMapFromRentCache(citySlug, portal, operation),
  ]);

  let enriched = base.map((listing) => ({
    ...listing,
    url: listing.url ?? urlById.get(listing.id) ?? null,
  }));

  if (resolveMissingUrls && portal === "sreality") {
    const missingActiveIds = enriched
      .filter((listing) => listing.status === "active" && !listing.url && listing.id.startsWith("sr_"))
      .map((listing) => listing.id);
    if (missingActiveIds.length) {
      const resolved = await fetchSrealityListingDetailUrls(missingActiveIds);
      if (resolved.size) {
        enriched = enriched.map((listing) => ({
          ...listing,
          url: listing.url ?? resolved.get(listing.id) ?? null,
        }));
      }
    }
  }

  if (!slim) return enriched;

  return enriched.map((listing) => {
    const isRoom =
      listing.property_type === "room" ||
      listing.property_type === "pokoj" ||
      listing.url?.includes("/pokoj");
    // Sale good-offers parses ownership / floor / loan from flat descriptions.
    const keepDescription = operation === "sale" || isRoom;
    return {
      ...listing,
      price_history: [],
      description: keepDescription ? listing.description ?? null : null,
    };
  });
}
