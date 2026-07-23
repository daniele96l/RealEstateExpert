import type { TrackedRentalListing } from "@/lib/types";
import { fetchSrealityListingDetailUrls } from "@/lib/server/sreality-search";
import type { OccupancyCitySlug } from "./cities";
import { registryBreakdownListings } from "./breakdown-listings";
import { DEFAULT_OCCUPANCY_PORTAL, type OccupancyPortal } from "./constants";
import { listingUrlMapFromRentCache } from "./listings-preview";

export async function buildBreakdownListings(
  listings: Record<string, TrackedRentalListing>,
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<TrackedRentalListing[]> {
  const [base, urlById] = await Promise.all([
    Promise.resolve(registryBreakdownListings(listings, citySlug)),
    listingUrlMapFromRentCache(citySlug, portal),
  ]);

  let enriched = base.map((listing) => ({
    ...listing,
    url: listing.url ?? urlById.get(listing.id) ?? null,
  }));

  if (portal === "sreality") {
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

  return enriched;
}
