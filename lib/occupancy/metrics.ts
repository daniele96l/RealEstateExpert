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
import { loadAllSnapshots, loadSnapshotsInWindow } from "./registry";
import { computeSegmentGroups } from "./segment-metrics";
import { resolveListingZone } from "./zone";
import { aggregateOccupancyListings, averageMetricValues } from "./aggregate";
import {
  resolveOccupancyMetricsContext,
  zoneInventoryBasis,
  type OccupancyMetricsContext,
} from "./tracking-window";
import {
  occupancyMetricsPeriodDays,
  type OccupancyMetricsPeriod,
} from "./metrics-period";

export interface ComputeOccupancyMetricsOptions {
  asOf?: string;
  period?: OccupancyMetricsPeriod;
}

function applyMetricsPeriod(
  ctx: OccupancyMetricsContext,
  period?: OccupancyMetricsPeriod,
): OccupancyMetricsContext {
  if (!ctx.flow_metrics_ready) return ctx;
  if (!period) return ctx;
  if (period === "longest") {
    return {
      ...ctx,
      occupancy_window_days: ctx.tracking_days,
      turnover_window_days: ctx.tracking_days,
    };
  }
  const windowDays = Math.min(occupancyMetricsPeriodDays(period), ctx.tracking_days);
  return {
    ...ctx,
    occupancy_window_days: windowDays,
    turnover_window_days: windowDays,
  };
}

function resolveAsOfMs(asOf?: string): number {
  if (!asOf) return Date.now();
  const ms = new Date(asOf).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

async function avgActiveInventoryLastDays(
  days: number,
  asOfMs: number,
  citySlug: Parameters<typeof loadSnapshotsInWindow>[2],
  portal: OccupancyPortal,
): Promise<number | null> {
  if (days <= 0) return null;
  const snapshots = await loadSnapshotsInWindow(days, asOfMs, citySlug, portal);
  if (!snapshots.length) return null;
  const counts = snapshots.map((s) => s.active_count);
  return averageMetricValues(counts);
}

function aggregateOptions(
  ctx: OccupancyMetricsContext,
  occupancyInventoryBasis: number | null,
  turnoverInventoryBasis: number | null,
  period?: OccupancyMetricsPeriod,
) {
  const windowStartMs =
    period === "longest" && ctx.tracking_started_at
      ? new Date(ctx.tracking_started_at).getTime()
      : null;
  return {
    flowMetricsReady: ctx.flow_metrics_ready,
    occupancyInventoryBasis,
    turnoverInventoryBasis,
    windowStartMs,
  };
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
  const allSnapshots = await loadAllSnapshots(citySlug, portal);
  const asOfMs = resolveAsOfMs(
    options?.asOf ?? allSnapshots[allSnapshots.length - 1]?.fetched_at ?? registry.updated_at,
  );
  const ctx = applyMetricsPeriod(
    resolveOccupancyMetricsContext(allSnapshots, asOfMs),
    options?.period,
  );

  const all = Object.values(registry.listings).map((listing) => ({
    ...listing,
    zone: resolveListingZone(listing.address, listing.lat, listing.lng, citySlug),
  }));

  const avgActiveOccupancy = await avgActiveInventoryLastDays(
    ctx.occupancy_window_days,
    asOfMs,
    citySlug,
    portal,
  );
  const avgActiveTurnover = await avgActiveInventoryLastDays(
    ctx.turnover_window_days,
    asOfMs,
    citySlug,
    portal,
  );

  const cityAggregateOptions = aggregateOptions(
    ctx,
    avgActiveOccupancy,
    avgActiveTurnover,
    options?.period,
  );
  const cityTotals = aggregateOccupancyListings(
    all,
    ctx.occupancy_window_days,
    ctx.turnover_window_days,
    avgActiveTurnover,
    asOfMs,
    cityAggregateOptions,
  );

  const byZone = new Map<string, TrackedRentalListing[]>();
  for (const listing of all) {
    const zone = listing.zone ?? "Altro";
    const bucket = byZone.get(zone) ?? [];
    bucket.push(listing);
    byZone.set(zone, bucket);
  }

  const areas: OccupancyAreaMetrics[] = [...byZone.entries()]
    .map(([zone, items]) => {
      const zoneActive = items.filter((l) => l.status === "active").length;
      const zoneTurnoverBasis = zoneInventoryBasis(
        avgActiveTurnover,
        cityTotals.active_count,
        zoneActive,
      );
      const zoneOccupancyBasis = zoneInventoryBasis(
        avgActiveOccupancy,
        cityTotals.active_count,
        zoneActive,
      );
      return {
        zone,
        ...aggregateOccupancyListings(
          items,
          ctx.occupancy_window_days,
          ctx.turnover_window_days,
          zoneTurnoverBasis,
          asOfMs,
          {
            ...cityAggregateOptions,
            occupancyInventoryBasis: zoneOccupancyBasis,
            turnoverInventoryBasis: zoneTurnoverBasis,
          },
        ),
      };
    })
    .sort((a, b) => b.active_count - a.active_count || a.zone.localeCompare(b.zone, "it"));

  const segments = computeSegmentGroups(
    all,
    cityConfig.market,
    ctx.occupancy_window_days,
    ctx.turnover_window_days,
    asOfMs,
    {
      ...cityAggregateOptions,
      cityActive: cityTotals.active_count,
      avgActiveOccupancy,
      avgActiveTurnover,
    },
  );

  return {
    city: cityConfig.city,
    market: cityConfig.market,
    portal,
    updated_at: registry.updated_at,
    snapshot_count: registry.snapshot_count,
    last_provider: registry.last_provider ?? null,
    tracking_days: ctx.tracking_days,
    tracking_snapshot_days: ctx.tracking_snapshot_days,
    tracking_started_at: ctx.tracking_started_at,
    tracking_ended_at: ctx.tracking_ended_at,
    flow_metrics_ready: ctx.flow_metrics_ready,
    occupancy_target_days: ctx.occupancy_target_days,
    turnover_target_days: ctx.turnover_target_days,
    turnover_window_days: ctx.turnover_window_days,
    occupancy_window_days: ctx.occupancy_window_days,
    areas,
    segments,
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

// Re-export constants for callers/tests that referenced them from metrics.
export { OCCUPANCY_WINDOW_DAYS, OCCUPANCY_TURNOVER_DAYS };
