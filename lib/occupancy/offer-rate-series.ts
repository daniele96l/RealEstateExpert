import type { MarketId } from "@/lib/markets";
import type {
  OccupancyBasicListing,
  OccupancyOfferBreakdownGroup,
  OccupancyOfferRatePoint,
  OccupancySnapshot,
} from "@/lib/types";
import { normalizeOccupancyPropertyType } from "./filtered-breakdown";
import type { OccupancyOperation } from "./operation";
import { listSegmentBuckets } from "./segment-metrics";

export const OFFER_BREAKDOWN_GROUPS: OccupancyOfferBreakdownGroup[] = [
  "type",
  "size",
  "rooms",
  "price",
];

export type OfferSeriesMode = "new" | "removed";

function withNormalizedType(listing: OccupancyBasicListing): OccupancyBasicListing {
  return {
    ...listing,
    property_type: normalizeOccupancyPropertyType(listing),
  };
}

function countByBuckets(
  listings: OccupancyBasicListing[],
  group: OccupancyOfferBreakdownGroup,
  market: MarketId,
  operation: OccupancyOperation,
): Record<string, number> {
  const buckets = listSegmentBuckets(group, market, operation);
  const counts: Record<string, number> = {};
  for (const bucket of buckets) counts[bucket.id] = 0;
  for (const listing of listings) {
    const normalized = withNormalizedType(listing);
    const bucket = buckets.find((entry) => entry.match(normalized));
    if (!bucket) continue;
    counts[bucket.id] = (counts[bucket.id] ?? 0) + 1;
  }
  return counts;
}

function formatAxisLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso.slice(0, 10);
  const d = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** Skip scrape coverage jumps (e.g. 197 → 830) that fake mass new/removed offers. */
const COVERAGE_JUMP_RATIO = 1.5;

function isCoverageJump(previousActive: number, currentActive: number): boolean {
  const prev = Math.max(previousActive, 1);
  const curr = Math.max(currentActive, 1);
  const ratio = curr / prev;
  return ratio >= COVERAGE_JUMP_RATIO || ratio <= 1 / COVERAGE_JUMP_RATIO;
}

/**
 * Offer / removal rate over time between consecutive snapshots,
 * with breakdowns by type / size / rooms / price.
 * Intervals where inventory coverage jumps sharply are omitted.
 */
export function buildOfferRateSeries(
  snapshots: OccupancySnapshot[],
  market: MarketId,
  operation: OccupancyOperation = "rent",
): OccupancyOfferRatePoint[] {
  if (snapshots.length < 2) return [];

  const points: OccupancyOfferRatePoint[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const previous = snapshots[i - 1]!;
    const current = snapshots[i]!;
    if (isCoverageJump(previous.active_count, current.active_count)) continue;

    const prevIds = new Set(previous.listings.map((l) => l.id));
    const currIds = new Set(current.listings.map((l) => l.id));

    const newcomers = current.listings.filter((l) => !prevIds.has(l.id));
    const removed = previous.listings.filter((l) => !currIds.has(l.id));

    points.push({
      fetched_at: current.fetched_at,
      label: formatAxisLabel(current.fetched_at),
      new_total: newcomers.length,
      removed_total: removed.length,
      active_count: current.active_count,
      by_type: countByBuckets(newcomers, "type", market, operation),
      by_size: countByBuckets(newcomers, "size", market, operation),
      by_rooms: countByBuckets(newcomers, "rooms", market, operation),
      by_price: countByBuckets(newcomers, "price", market, operation),
      removed_by_type: countByBuckets(removed, "type", market, operation),
      removed_by_size: countByBuckets(removed, "size", market, operation),
      removed_by_rooms: countByBuckets(removed, "rooms", market, operation),
      removed_by_price: countByBuckets(removed, "price", market, operation),
    });
  }

  return points;
}

export function offerBreakdownField(
  group: OccupancyOfferBreakdownGroup,
  mode: OfferSeriesMode = "new",
):
  | "by_type"
  | "by_size"
  | "by_rooms"
  | "by_price"
  | "removed_by_type"
  | "removed_by_size"
  | "removed_by_rooms"
  | "removed_by_price" {
  if (mode === "removed") {
    if (group === "type") return "removed_by_type";
    if (group === "size") return "removed_by_size";
    if (group === "rooms") return "removed_by_rooms";
    return "removed_by_price";
  }
  if (group === "type") return "by_type";
  if (group === "size") return "by_size";
  if (group === "rooms") return "by_rooms";
  return "by_price";
}
