import type {
  OccupancyAreaMetrics,
  OccupancyCityMetrics,
  OccupancyRegistry,
  TrackedRentalListing,
} from "@/lib/types";
import {
  OCCUPANCY_CITY,
  OCCUPANCY_MARKET,
  OCCUPANCY_TURNOVER_DAYS,
  OCCUPANCY_WINDOW_DAYS,
} from "./constants";
import { loadSnapshotsInWindow } from "./registry";

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

function withinDays(iso: string | null, days: number, now = Date.now()): boolean {
  if (!iso) return false;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
}

function rentedInWindow(listing: TrackedRentalListing, windowDays: number, now = Date.now()): boolean {
  return (
    listing.status === "presumed_rented" &&
    listing.rented_at != null &&
    withinDays(listing.rented_at, windowDays, now)
  );
}

function aggregateListings(
  items: TrackedRentalListing[],
  windowDays: number,
  turnoverDays: number,
  avgActiveInventory: number | null,
  now = Date.now(),
): Omit<OccupancyAreaMetrics, "zone"> {
  const active = items.filter((l) => l.status === "active");
  const rentedWindow = items.filter((l) => rentedInWindow(l, windowDays, now));
  const domValues = rentedWindow
    .map((l) => l.days_on_market)
    .filter((d): d is number => d != null);

  const rentedTurnover = items.filter((l) => rentedInWindow(l, turnoverDays, now)).length;
  const turnover =
    avgActiveInventory != null && avgActiveInventory > 0
      ? Math.round((rentedTurnover / avgActiveInventory) * 100) / 100
      : active.length > 0
        ? Math.round((rentedTurnover / active.length) * 100) / 100
        : null;

  const denominator = active.length + rentedWindow.length;
  const occupancy =
    denominator > 0 ? Math.round((rentedWindow.length / denominator) * 1000) / 10 : null;

  return {
    active_count: active.length,
    rented_in_window: rentedWindow.length,
    avg_days_on_market: average(domValues),
    median_days_on_market: median(domValues),
    turnover_30d: turnover,
    estimated_occupancy_pct: occupancy,
  };
}

async function avgActiveInventoryLastDays(days: number): Promise<number | null> {
  const snapshots = await loadSnapshotsInWindow(days);
  if (!snapshots.length) return null;
  const counts = snapshots.map((s) => s.active_count);
  return average(counts);
}

export async function computeOccupancyMetrics(
  registry: OccupancyRegistry,
): Promise<OccupancyCityMetrics> {
  const all = Object.values(registry.listings);
  const avgActive = await avgActiveInventoryLastDays(OCCUPANCY_TURNOVER_DAYS);
  const cityTotals = aggregateListings(
    all,
    OCCUPANCY_WINDOW_DAYS,
    OCCUPANCY_TURNOVER_DAYS,
    avgActive,
  );

  const byZone = new Map<string, TrackedRentalListing[]>();
  for (const listing of all) {
    const zone = listing.zone ?? "Altro";
    const bucket = byZone.get(zone) ?? [];
    bucket.push(listing);
    byZone.set(zone, bucket);
  }

  const areas: OccupancyAreaMetrics[] = [...byZone.entries()]
    .map(([zone, items]) => ({
      zone,
      ...aggregateListings(items, OCCUPANCY_WINDOW_DAYS, OCCUPANCY_TURNOVER_DAYS, avgActive),
    }))
    .sort((a, b) => b.active_count - a.active_count || a.zone.localeCompare(b.zone, "it"));

  return {
    city: OCCUPANCY_CITY,
    market: OCCUPANCY_MARKET,
    updated_at: registry.updated_at,
    snapshot_count: registry.snapshot_count,
    occupancy_window_days: OCCUPANCY_WINDOW_DAYS,
    areas,
    ...cityTotals,
  };
}

export async function loadOccupancyMetrics(): Promise<OccupancyCityMetrics> {
  const { loadRegistry } = await import("./registry");
  const registry = await loadRegistry();
  return computeOccupancyMetrics(registry);
}
