import type { OccupancyAreaMetrics, TrackedRentalListing } from "@/lib/types";
import { averageMetricValues } from "./aggregate";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetweenMs(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / DAY_MS));
}

function publishedMs(listing: TrackedRentalListing): number | null {
  if (!listing.listing_published_at) return null;
  const ms = new Date(listing.listing_published_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export interface AggregatePostedOptions {
  windowStartMs?: number | null;
  flowMetricsReady?: boolean;
}

/** Metrics from portal publish dates on currently active listings only. */
export function aggregatePostedOccupancyListings(
  items: TrackedRentalListing[],
  windowDays: number,
  now = Date.now(),
  options?: AggregatePostedOptions,
): Omit<OccupancyAreaMetrics, "zone"> {
  const active = items.filter((listing) => listing.status === "active");
  const windowStartMs =
    options?.windowStartMs ?? (windowDays > 0 ? now - windowDays * DAY_MS : now);

  const withPublishDate = active.filter((listing) => publishedMs(listing) != null);
  const flowReady = options?.flowMetricsReady ?? withPublishDate.length > 0;

  const postedInWindow = flowReady
    ? active.filter((listing) => {
        const published = publishedMs(listing);
        return published != null && published >= windowStartMs && published <= now;
      })
    : [];

  const domValues = withPublishDate
    .map((listing) => daysBetweenMs(publishedMs(listing)!, now))
    .filter((days) => days >= 0);

  const priceValues = active.map((listing) => listing.price).filter((price) => price > 0);
  const pricePerSqmValues = active
    .map((listing) => (listing.sqm != null && listing.sqm > 0 ? listing.price / listing.sqm : null))
    .filter((value): value is number => value != null && value > 0);

  const avgDom = flowReady ? averageMetricValues(domValues) : null;

  return {
    active_count: active.length,
    rented_in_window: postedInWindow.length,
    avg_price: flowReady ? averageMetricValues(priceValues) : null,
    avg_price_per_sqm: flowReady ? averageMetricValues(pricePerSqmValues) : null,
    avg_days_on_market: avgDom,
    median_days_on_market: flowReady ? median(domValues) : null,
    avg_waiting_days: avgDom,
    turnover_30d: null,
    turnover_rented_30d: 0,
    turnover_inventory_basis: null,
    estimated_occupancy_pct: null,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

export function postedMetricsReady(listings: TrackedRentalListing[]): boolean {
  return listings.some(
    (listing) => listing.status === "active" && publishedMs(listing) != null,
  );
}

export function mergePublishedDatesFromSnapshot(
  listings: TrackedRentalListing[],
  snapshotListings: Array<{ id: string; listing_published_at?: string | null; listing_updated_at?: string | null }>,
): TrackedRentalListing[] {
  const byId = new Map(snapshotListings.map((listing) => [listing.id, listing]));
  return listings.map((listing) => {
    const fromSnapshot = byId.get(listing.id);
    if (!fromSnapshot) return listing;
    return {
      ...listing,
      listing_published_at: listing.listing_published_at ?? fromSnapshot.listing_published_at ?? null,
      listing_updated_at: listing.listing_updated_at ?? fromSnapshot.listing_updated_at ?? null,
    };
  });
}
