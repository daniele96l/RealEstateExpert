import type { MarketId } from "@/lib/markets";
import type { OccupancyBasicListing, OccupancySegmentGroupId, TrackedRentalListing } from "@/lib/types";
import { rentedInWindow, newInWindow } from "./aggregate";
import type { OccupancyCitySlug } from "./cities";
import { withNormalizedPropertyType } from "./filtered-breakdown";
import {
  DEFAULT_OCCUPANCY_OPERATION,
  type OccupancyOperation,
} from "./operation";
import { getSegmentMatcher } from "./segment-metrics";
import { resolveListingZone } from "./zone";

export type BreakdownGroupId = "zone" | OccupancySegmentGroupId;

export function listingInBreakdownZone(
  listing: OccupancyBasicListing,
  zone: string,
  citySlug: OccupancyCitySlug,
): boolean {
  const resolved =
    listing.zone ??
    resolveListingZone(listing.address, listing.lat, listing.lng, citySlug, listing.description);
  return resolved === zone;
}

function breakdownRowMatcher(
  group: BreakdownGroupId,
  rowKey: string,
  citySlug: OccupancyCitySlug,
  market: MarketId,
  operation: OccupancyOperation,
): (listing: OccupancyBasicListing) => boolean {
  return group === "zone"
    ? (listing) => listingInBreakdownZone(listing, rowKey, citySlug)
    : getSegmentMatcher(group, rowKey, market, operation);
}

export function filterActiveBreakdownListings(
  listings: TrackedRentalListing[],
  group: BreakdownGroupId,
  rowKey: string,
  citySlug: OccupancyCitySlug,
  market: MarketId,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): TrackedRentalListing[] {
  const matchesRow = breakdownRowMatcher(group, rowKey, citySlug, market, operation);
  return listings.filter((listing) => listing.status === "active" && matchesRow(listing));
}

export function filterRentedBreakdownListings(
  listings: TrackedRentalListing[],
  group: BreakdownGroupId,
  rowKey: string,
  citySlug: OccupancyCitySlug,
  market: MarketId,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
  opts: {
    windowDays: number;
    asOfMs: number;
    windowStartMs?: number | null;
  },
): TrackedRentalListing[] {
  const matchesRow = breakdownRowMatcher(group, rowKey, citySlug, market, operation);
  return listings.filter(
    (listing) =>
      matchesRow(listing) &&
      rentedInWindow(listing, opts.windowDays, opts.asOfMs, opts.windowStartMs),
  );
}

export function filterNewBreakdownListings(
  listings: TrackedRentalListing[],
  group: BreakdownGroupId,
  rowKey: string,
  citySlug: OccupancyCitySlug,
  market: MarketId,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
  opts: {
    windowDays: number;
    asOfMs: number;
    windowStartMs?: number | null;
  },
): TrackedRentalListing[] {
  const matchesRow = breakdownRowMatcher(group, rowKey, citySlug, market, operation);
  return listings.filter(
    (listing) =>
      matchesRow(listing) &&
      newInWindow(listing, opts.windowDays, opts.asOfMs, opts.windowStartMs),
  );
}

export function registryBreakdownListings(
  listings: Record<string, TrackedRentalListing>,
  citySlug: OccupancyCitySlug,
): TrackedRentalListing[] {
  return Object.values(listings).map((listing) =>
    withNormalizedPropertyType({
      ...listing,
      property_type: listing.property_type ?? null,
      zone:
        listing.zone ??
        resolveListingZone(
          listing.address,
          listing.lat,
          listing.lng,
          citySlug,
          listing.description,
        ),
    }),
  );
}
