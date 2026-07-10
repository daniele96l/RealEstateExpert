import type {
  OccupancyAreaMetrics,
  OccupancyCityMetrics,
  OccupancyRegistry,
  TrackedRentalListing,
} from "@/lib/types";
import {
  OCCUPANCY_TURNOVER_DAYS,
  OCCUPANCY_WINDOW_DAYS,
  DEFAULT_OCCUPANCY_PORTAL,
  type OccupancyPortal,
} from "./constants";
import { getOccupancyCityConfig, type OccupancyCitySlug } from "./cities";
import { loadSnapshotsInWindow } from "./registry";
import { resolveListingZone } from "./zone";

export interface ComputeOccupancyMetricsOptions {
  asOf?: string;
}

function resolveAsOfMs(asOf?: string): number {
  if (!asOf) return Date.now();
  const ms = new Date(asOf).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
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

  const priceValues = rentedWindow.map((l) => l.price).filter((p) => p > 0);
  const pricePerSqmValues = rentedWindow
    .map((l) => (l.sqm != null && l.sqm > 0 ? l.price / l.sqm : null))
    .filter((v): v is number => v != null && v > 0);

  const rentedTurnover = items.filter((l) => rentedInWindow(l, turnoverDays, now)).length;
  const inventoryBasis =
    avgActiveInventory != null && avgActiveInventory > 0
      ? avgActiveInventory
      : active.length > 0
        ? active.length
        : null;
  const turnover =
    inventoryBasis != null && inventoryBasis > 0
      ? Math.round((rentedTurnover / inventoryBasis) * 100) / 100
      : null;

  const denominator = active.length + rentedWindow.length;
  const occupancy =
    denominator > 0 ? Math.round((rentedWindow.length / denominator) * 1000) / 10 : null;

  return {
    active_count: active.length,
    rented_in_window: rentedWindow.length,
    avg_price: average(priceValues),
    avg_price_per_sqm: average(pricePerSqmValues),
    avg_days_on_market: average(domValues),
    median_days_on_market: median(domValues),
    turnover_30d: turnover,
    turnover_rented_30d: rentedTurnover,
    turnover_inventory_basis: inventoryBasis,
    estimated_occupancy_pct: occupancy,
  };
}

async function avgActiveInventoryLastDays(
  days: number,
  asOfMs: number,
  citySlug: Parameters<typeof loadSnapshotsInWindow>[2],
  portal: OccupancyPortal,
): Promise<number | null> {
  const snapshots = await loadSnapshotsInWindow(days, asOfMs, citySlug, portal);
  if (!snapshots.length) return null;
  const counts = snapshots.map((s) => s.active_count);
  return average(counts);
}

export async function computeOccupancyMetrics(
  registry: OccupancyRegistry,
  options?: ComputeOccupancyMetricsOptions & { citySlug?: OccupancyCitySlug },
): Promise<OccupancyCityMetrics> {
  const portal = registry.portal ?? DEFAULT_OCCUPANCY_PORTAL;
  const citySlug =
    options?.citySlug ??
    (registry.market === "cz"
      ? "brno"
      : registry.city.toLowerCase().includes("brno")
        ? "brno"
        : "reggio_calabria");
  const cityConfig = getOccupancyCityConfig(citySlug);
  const asOfMs = resolveAsOfMs(options?.asOf ?? registry.updated_at);
  const all = Object.values(registry.listings).map((listing) => ({
    ...listing,
    zone: resolveListingZone(listing.address, listing.lat, listing.lng, citySlug),
  }));
  const avgActive = await avgActiveInventoryLastDays(OCCUPANCY_TURNOVER_DAYS, asOfMs, citySlug, portal);
  const cityTotals = aggregateListings(
    all,
    OCCUPANCY_WINDOW_DAYS,
    OCCUPANCY_TURNOVER_DAYS,
    avgActive,
    asOfMs,
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
      ...aggregateListings(items, OCCUPANCY_WINDOW_DAYS, OCCUPANCY_TURNOVER_DAYS, null, asOfMs),
    }))
    .sort((a, b) => b.active_count - a.active_count || a.zone.localeCompare(b.zone, "it"));

  return {
    city: cityConfig.city,
    market: cityConfig.market,
    portal,
    updated_at: registry.updated_at,
    snapshot_count: registry.snapshot_count,
    last_provider: registry.last_provider ?? null,
    occupancy_window_days: OCCUPANCY_WINDOW_DAYS,
    areas,
    ...cityTotals,
  };
}

export async function loadOccupancyMetrics(
  citySlug: OccupancyCitySlug = "reggio_calabria",
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancyCityMetrics> {
  const { loadRegistry } = await import("./registry");
  const registry = await loadRegistry(citySlug, portal);
  return computeOccupancyMetrics(registry, { citySlug });
}
