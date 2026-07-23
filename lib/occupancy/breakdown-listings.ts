import type { MarketId } from "@/lib/markets";
import type { OccupancyBasicListing, OccupancySegmentGroupId, TrackedRentalListing } from "@/lib/types";
import type { OccupancyCitySlug } from "./cities";
import { withNormalizedPropertyType } from "./filtered-breakdown";
import { getSegmentMatcher } from "./segment-metrics";
import { resolveListingZone } from "./zone";

export type BreakdownGroupId = "zone" | OccupancySegmentGroupId;

export function listingInBreakdownZone(
  listing: OccupancyBasicListing,
  zone: string,
  citySlug: OccupancyCitySlug,
): boolean {
  const resolved =
    listing.zone ?? resolveListingZone(listing.address, listing.lat, listing.lng, citySlug);
  return resolved === zone;
}

export function filterActiveBreakdownListings(
  listings: TrackedRentalListing[],
  group: BreakdownGroupId,
  rowKey: string,
  citySlug: OccupancyCitySlug,
  market: MarketId,
): TrackedRentalListing[] {
  const matchesRow =
    group === "zone"
      ? (listing: OccupancyBasicListing) => listingInBreakdownZone(listing, rowKey, citySlug)
      : getSegmentMatcher(group, rowKey, market);

  return listings.filter((listing) => listing.status === "active" && matchesRow(listing));
}

export function registryBreakdownListings(
  listings: Record<string, TrackedRentalListing>,
  citySlug: OccupancyCitySlug,
): TrackedRentalListing[] {
  return Object.values(listings).map((listing) =>
    withNormalizedPropertyType({
      ...listing,
      property_type: listing.property_type ?? null,
      zone: listing.zone ?? resolveListingZone(listing.address, listing.lat, listing.lng, citySlug),
    }),
  );
}
