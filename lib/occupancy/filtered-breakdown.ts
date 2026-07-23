import type {
  OccupancyAreaMetrics,
  OccupancySegmentGroups,
  TrackedRentalListing,
} from "@/lib/types";
import type { MarketId } from "@/lib/markets";
import { listingInBreakdownZone } from "./breakdown-listings";
import type { OccupancyCitySlug } from "./cities";
import { aggregateOccupancyListings } from "./aggregate";
import { aggregatePostedOccupancyListings } from "./aggregate-posted";
import type { OccupancyMetricsBasis } from "./metrics-basis";
import { isOccupancyRoomListing, computeSegmentGroups } from "./segment-metrics";
import { resolveListingZone } from "./zone";

export type OccupancyTypeFilter = "all" | "flat" | "room";

export function normalizeOccupancyPropertyType(
  listing: Pick<TrackedRentalListing, "property_type" | "url"> & { title?: string | null },
): string | null {
  const raw = listing.property_type?.trim().toLowerCase() ?? "";
  if (raw === "room" || raw === "pokoj") return "room";
  if (raw) return raw;
  const url = listing.url?.toLowerCase() ?? "";
  if (url.includes("/pokoj")) return "room";
  return null;
}

export function withNormalizedPropertyType(listing: TrackedRentalListing): TrackedRentalListing {
  return {
    ...listing,
    property_type: normalizeOccupancyPropertyType(listing),
  };
}

export function filterOccupancyListings(
  listings: TrackedRentalListing[],
  opts: {
    areaFilter: "all" | string;
    typeFilter: OccupancyTypeFilter;
    citySlug: OccupancyCitySlug;
  },
): TrackedRentalListing[] {
  return listings
    .map(withNormalizedPropertyType)
    .map((listing) => ({
      ...listing,
      zone:
        listing.zone ??
        resolveListingZone(listing.address, listing.lat, listing.lng, opts.citySlug),
    }))
    .filter((listing) => {
      if (
        opts.areaFilter !== "all" &&
        !listingInBreakdownZone(listing, opts.areaFilter, opts.citySlug)
      ) {
        return false;
      }
      if (opts.typeFilter === "room" && !isOccupancyRoomListing(listing)) return false;
      if (opts.typeFilter === "flat" && isOccupancyRoomListing(listing)) return false;
      return true;
    });
}

export function buildFilteredAreas(
  listings: TrackedRentalListing[],
  opts: {
    windowDays: number;
    turnoverDays: number;
    asOfMs: number;
    metricsBasis: OccupancyMetricsBasis;
    flowMetricsReady: boolean;
    windowStartMs?: number;
  },
): OccupancyAreaMetrics[] {
  const byZone = new Map<string, TrackedRentalListing[]>();
  for (const listing of listings) {
    const zone = listing.zone ?? "Altro";
    const bucket = byZone.get(zone) ?? [];
    bucket.push(listing);
    byZone.set(zone, bucket);
  }

  return [...byZone.entries()]
    .map(([zone, items]) => {
      if (opts.metricsBasis === "posted") {
        return {
          zone,
          ...aggregatePostedOccupancyListings(items, opts.windowDays, opts.asOfMs, {
            flowMetricsReady: opts.flowMetricsReady,
            windowStartMs: opts.windowStartMs,
          }),
        };
      }
      const active = items.filter((l) => l.status === "active").length;
      return {
        zone,
        ...aggregateOccupancyListings(
          items,
          opts.windowDays,
          opts.turnoverDays,
          active > 0 ? active : null,
          opts.asOfMs,
          {
            flowMetricsReady: opts.flowMetricsReady,
            windowStartMs: opts.windowStartMs,
            turnoverWindowStartMs: opts.windowStartMs,
          },
        ),
      };
    })
    .sort((a, b) => b.active_count - a.active_count || a.zone.localeCompare(b.zone, "it"));
}

export function buildFilteredSegments(
  listings: TrackedRentalListing[],
  market: MarketId,
  opts: {
    windowDays: number;
    turnoverDays: number;
    asOfMs: number;
    metricsBasis: OccupancyMetricsBasis;
    flowMetricsReady: boolean;
    windowStartMs?: number;
  },
): OccupancySegmentGroups {
  const cityActive = listings.filter((l) => l.status === "active").length;
  const windowStartMs =
    opts.windowStartMs ?? opts.asOfMs - opts.windowDays * 24 * 60 * 60 * 1000;
  return computeSegmentGroups(
    listings,
    market,
    opts.windowDays,
    opts.turnoverDays,
    opts.asOfMs,
    {
      flowMetricsReady: opts.flowMetricsReady,
      windowStartMs,
      turnoverWindowStartMs: windowStartMs,
      snapshots: [],
      occupancyWindowStartMs: windowStartMs,
      cityActive,
      avgActiveOccupancy: null,
      avgActiveTurnover: null,
      metricsBasis: opts.metricsBasis,
    },
  );
}
