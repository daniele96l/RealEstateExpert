import type { MarketId } from "@/lib/markets";
import type {
  OccupancyBasicListing,
  OccupancySegmentGroups,
  OccupancySegmentMetrics,
  OccupancySnapshot,
  TrackedRentalListing,
} from "@/lib/types";
import {
  aggregateOccupancyListings,
  computeScopedInventoryBasis,
  type AggregateOccupancyOptions,
} from "./aggregate";
import { zoneInventoryBasis } from "./tracking-window";

interface SegmentBucket {
  id: string;
  match: (listing: OccupancyBasicListing) => boolean;
}

function priceBuckets(market: MarketId): SegmentBucket[] {
  if (market === "cz") {
    return [
      { id: "under_12000", match: (l) => l.price <= 12_000 },
      { id: "12000_18000", match: (l) => l.price > 12_000 && l.price <= 18_000 },
      { id: "18000_25000", match: (l) => l.price > 18_000 && l.price <= 25_000 },
      { id: "25000_35000", match: (l) => l.price > 25_000 && l.price <= 35_000 },
      { id: "over_35000", match: (l) => l.price > 35_000 },
    ];
  }
  return [
    { id: "under_500", match: (l) => l.price <= 500 },
    { id: "500_750", match: (l) => l.price > 500 && l.price <= 750 },
    { id: "750_1000", match: (l) => l.price > 750 && l.price <= 1_000 },
    { id: "1000_1500", match: (l) => l.price > 1_000 && l.price <= 1_500 },
    { id: "over_1500", match: (l) => l.price > 1_500 },
  ];
}

const ROOM_BUCKETS: SegmentBucket[] = [
  { id: "1", match: (l) => l.rooms === 1 },
  { id: "2", match: (l) => l.rooms === 2 },
  { id: "3", match: (l) => l.rooms === 3 },
  { id: "4_plus", match: (l) => l.rooms != null && l.rooms >= 4 },
  { id: "unknown", match: (l) => l.rooms == null },
];

const SIZE_BUCKETS: SegmentBucket[] = [
  { id: "under_40", match: (l) => l.sqm != null && l.sqm <= 40 },
  { id: "40_60", match: (l) => l.sqm != null && l.sqm > 40 && l.sqm <= 60 },
  { id: "60_80", match: (l) => l.sqm != null && l.sqm > 60 && l.sqm <= 80 },
  { id: "80_100", match: (l) => l.sqm != null && l.sqm > 80 && l.sqm <= 100 },
  { id: "over_100", match: (l) => l.sqm != null && l.sqm > 100 },
  { id: "unknown", match: (l) => l.sqm == null },
];

export interface SegmentGroupOptions extends AggregateOccupancyOptions {
  snapshots: OccupancySnapshot[];
  occupancyWindowStartMs: number;
  turnoverWindowStartMs: number;
  cityActive: number;
  avgActiveOccupancy: number | null;
  avgActiveTurnover: number | null;
}

function buildGroup(
  listings: TrackedRentalListing[],
  buckets: SegmentBucket[],
  windowDays: number,
  turnoverDays: number,
  asOfMs: number,
  options: SegmentGroupOptions,
): OccupancySegmentMetrics[] {
  return buckets
    .map((bucket) => {
      const items = listings.filter(bucket.match);
      if (!items.length) return null;
      const segmentActive = items.filter((l) => l.status === "active").length;
      const turnoverBasis =
        computeScopedInventoryBasis(
          options.snapshots,
          options.turnoverWindowStartMs,
          asOfMs,
          bucket.match,
        ) ??
        zoneInventoryBasis(options.avgActiveTurnover, options.cityActive, segmentActive);
      const occupancyBasis =
        computeScopedInventoryBasis(
          options.snapshots,
          options.occupancyWindowStartMs,
          asOfMs,
          bucket.match,
        ) ??
        zoneInventoryBasis(options.avgActiveOccupancy, options.cityActive, segmentActive);
      return {
        segment_id: bucket.id,
        ...aggregateOccupancyListings(items, windowDays, turnoverDays, turnoverBasis, asOfMs, {
          flowMetricsReady: options.flowMetricsReady,
          occupancyInventoryBasis: occupancyBasis,
          turnoverInventoryBasis: turnoverBasis,
          windowStartMs: options.windowStartMs,
          turnoverWindowStartMs: options.turnoverWindowStartMs,
        }),
      };
    })
    .filter((row): row is OccupancySegmentMetrics => row != null);
}

export function computeSegmentGroups(
  listings: TrackedRentalListing[],
  market: MarketId,
  windowDays: number,
  turnoverDays: number,
  asOfMs: number,
  options: SegmentGroupOptions,
): OccupancySegmentGroups {
  return {
    price: buildGroup(listings, priceBuckets(market), windowDays, turnoverDays, asOfMs, options),
    rooms: buildGroup(listings, ROOM_BUCKETS, windowDays, turnoverDays, asOfMs, options),
    size: buildGroup(listings, SIZE_BUCKETS, windowDays, turnoverDays, asOfMs, options),
  };
}
