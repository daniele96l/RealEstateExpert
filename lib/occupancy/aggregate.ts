import type { OccupancyAreaMetrics, TrackedRentalListing } from "@/lib/types";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}


function daysBetween(startIso: string, endMs: number): number {
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round((endMs - start) / (24 * 60 * 60 * 1000)));
}

function wasTrackedBeforeRemoval(listing: TrackedRentalListing): boolean {
  if (listing.days_on_market != null && listing.days_on_market >= 1) return true;
  if (!listing.rented_at) return false;
  const firstMs = new Date(listing.first_seen_at).getTime();
  const rentedMs = new Date(listing.rented_at).getTime();
  if (!Number.isFinite(firstMs) || !Number.isFinite(rentedMs)) return false;
  return rentedMs - firstMs >= 24 * 60 * 60 * 1000;
}

function rentedInWindow(
  listing: TrackedRentalListing,
  windowDays: number,
  now = Date.now(),
  windowStartMs?: number | null,
): boolean {
  if (!listing.rented_at || windowDays <= 0) return false;
  const rentedMs = new Date(listing.rented_at).getTime();
  if (!Number.isFinite(rentedMs) || rentedMs > now) return false;
  const startMs = windowStartMs ?? now - windowDays * 24 * 60 * 60 * 1000;
  return (
    listing.status === "presumed_rented" &&
    rentedMs >= startMs &&
    wasTrackedBeforeRemoval(listing)
  );
}

export interface AggregateOccupancyOptions {
  occupancyInventoryBasis?: number | null;
  turnoverInventoryBasis?: number | null;
  flowMetricsReady?: boolean;
  windowStartMs?: number | null;
}

export function aggregateOccupancyListings(
  items: TrackedRentalListing[],
  windowDays: number,
  turnoverDays: number,
  turnoverInventoryBasis: number | null,
  now = Date.now(),
  options?: AggregateOccupancyOptions,
): Omit<OccupancyAreaMetrics, "zone"> {
  const flowReady = options?.flowMetricsReady ?? windowDays > 0;
  const windowStartMs = options?.windowStartMs;
  const active = items.filter((l) => l.status === "active");
  const rentedWindow = flowReady
    ? items.filter((l) => rentedInWindow(l, windowDays, now, windowStartMs))
    : [];
  const domValues = rentedWindow
    .map((l) => l.days_on_market)
    .filter((d): d is number => d != null);

  const priceValues = rentedWindow.map((l) => l.price).filter((p) => p > 0);
  const pricePerSqmValues = rentedWindow
    .map((l) => (l.sqm != null && l.sqm > 0 ? l.price / l.sqm : null))
    .filter((v): v is number => v != null && v > 0);

  const rentedTurnover = flowReady
    ? items.filter((l) => rentedInWindow(l, turnoverDays, now, windowStartMs)).length
    : 0;

  const turnoverBasis =
    options?.turnoverInventoryBasis ??
    turnoverInventoryBasis ??
    (active.length > 0 ? active.length : null);

  const turnover =
    flowReady && turnoverBasis != null && turnoverBasis > 0
      ? Math.round((rentedTurnover / turnoverBasis) * 100) / 100
      : null;

  const occupancyInventoryBasis = options?.occupancyInventoryBasis ?? turnoverBasis;
  const occupancyDenominator =
    flowReady && occupancyInventoryBasis != null && occupancyInventoryBasis > 0
      ? occupancyInventoryBasis + rentedWindow.length
      : active.length + rentedWindow.length;

  const occupancy =
    flowReady && occupancyDenominator > 0
      ? Math.round((rentedWindow.length / occupancyDenominator) * 1000) / 10
      : null;

  const activeWaitingDays = active.map((listing) => daysBetween(listing.first_seen_at, now));
  const avg_waiting_days = activeWaitingDays.length ? average(activeWaitingDays) : null;

  return {
    active_count: active.length,
    rented_in_window: rentedWindow.length,
    avg_price: flowReady ? average(priceValues) : null,
    avg_price_per_sqm: flowReady ? average(pricePerSqmValues) : null,
    avg_days_on_market: flowReady ? average(domValues) : null,
    median_days_on_market: flowReady ? median(domValues) : null,
    avg_waiting_days,
    turnover_30d: turnover,
    turnover_rented_30d: rentedTurnover,
    turnover_inventory_basis: turnoverBasis,
    estimated_occupancy_pct: occupancy,
  };
}

export function averageMetricValues(values: number[]): number | null {
  return average(values);
}
