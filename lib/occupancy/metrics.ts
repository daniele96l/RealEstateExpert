import type {
  OccupancyAreaMetrics,
  OccupancyBasicListing,
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
import { loadAllSnapshots } from "./registry";
import { computeSegmentGroups } from "./segment-metrics";
import { withNormalizedPropertyType } from "./filtered-breakdown";
import { resolveListingZone } from "./zone";
import {
  aggregateOccupancyListings,
  computeScopedInventoryBasis,
  timeWeightedAverageActiveCount,
} from "./aggregate";
import {
  resolveOccupancyMetricsContext,
  resolveWindowStartMs,
  zoneInventoryBasis,
  type OccupancyMetricsContext,
} from "./tracking-window";
import {
  aggregatePostedOccupancyListings,
  mergePublishedDatesFromSnapshot,
  postedMetricsReady,
} from "./aggregate-posted";
import {
  DEFAULT_OCCUPANCY_METRICS_BASIS,
  type OccupancyMetricsBasis,
} from "./metrics-basis";
import {
  DEFAULT_OCCUPANCY_METRICS_PERIOD,
  occupancyMetricsPeriodDays,
  type OccupancyMetricsPeriod,
} from "./metrics-period";

export interface ComputeOccupancyMetricsOptions {
  asOf?: string;
  period?: OccupancyMetricsPeriod;
  basis?: OccupancyMetricsBasis;
}

function applyPostedMetricsPeriod(
  ctx: OccupancyMetricsContext,
  period?: OccupancyMetricsPeriod,
): OccupancyMetricsContext {
  const fallbackDays = ctx.tracking_days > 0 ? ctx.tracking_days : 365;
  if (!period) {
    return {
      ...ctx,
      occupancy_window_days: 30,
      turnover_window_days: 30,
    };
  }
  if (period === "longest") {
    return {
      ...ctx,
      occupancy_window_days: fallbackDays,
      turnover_window_days: fallbackDays,
    };
  }
  const windowDays = occupancyMetricsPeriodDays(period);
  return {
    ...ctx,
    occupancy_window_days: windowDays,
    turnover_window_days: windowDays,
  };
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

function listingInZone(
  listing: OccupancyBasicListing,
  zone: string,
  citySlug: OccupancyCitySlug,
): boolean {
  const resolved =
    listing.zone ?? resolveListingZone(listing.address, listing.lat, listing.lng, citySlug);
  return resolved === zone;
}

function avgActiveInventoryInWindow(
  snapshots: Awaited<ReturnType<typeof loadAllSnapshots>>,
  windowDays: number,
  asOfMs: number,
  windowStartMs: number,
): number | null {
  if (windowDays <= 0) return null;
  return timeWeightedAverageActiveCount(snapshots, windowStartMs, asOfMs);
}

function buildAggregateOptions(
  ctx: OccupancyMetricsContext,
  occupancyInventoryBasis: number | null,
  turnoverInventoryBasis: number | null,
  asOfMs: number,
  period?: OccupancyMetricsPeriod,
) {
  const occupancyWindowStartMs = resolveWindowStartMs(
    asOfMs,
    ctx.occupancy_window_days,
    ctx.tracking_started_at,
    period,
  );
  const turnoverWindowStartMs = resolveWindowStartMs(
    asOfMs,
    ctx.turnover_window_days,
    ctx.tracking_started_at,
    period,
  );
  return {
    flowMetricsReady: ctx.flow_metrics_ready,
    occupancyInventoryBasis,
    turnoverInventoryBasis,
    windowStartMs: occupancyWindowStartMs,
    turnoverWindowStartMs,
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
  const period = options?.period;
  const basis = options?.basis ?? DEFAULT_OCCUPANCY_METRICS_BASIS;
  const trackingCtx = resolveOccupancyMetricsContext(allSnapshots, asOfMs);
  const ctx =
    basis === "posted"
      ? applyPostedMetricsPeriod(trackingCtx, period)
      : applyMetricsPeriod(trackingCtx, period);

  const occupancyWindowStartMs = resolveWindowStartMs(
    asOfMs,
    ctx.occupancy_window_days,
    ctx.tracking_started_at,
    basis === "posted" ? undefined : period,
  );

  let all: TrackedRentalListing[] = Object.values(registry.listings).map((listing) =>
    withNormalizedPropertyType({
      ...listing,
      property_type: listing.property_type ?? null,
      zone: listing.zone ?? resolveListingZone(listing.address, listing.lat, listing.lng, citySlug),
    }),
  );

  const latestSnapshot = allSnapshots[allSnapshots.length - 1];
  if (basis === "posted" && latestSnapshot?.listings.length) {
    all = mergePublishedDatesFromSnapshot(all, latestSnapshot.listings);
  }

  if (basis === "posted") {
    const postedFlowReady = postedMetricsReady(all);
    const postedOptions = {
      flowMetricsReady: postedFlowReady,
      windowStartMs: occupancyWindowStartMs,
    };
    const cityTotals = aggregatePostedOccupancyListings(
      all,
      ctx.occupancy_window_days,
      asOfMs,
      postedOptions,
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
        ...aggregatePostedOccupancyListings(
          items,
          ctx.occupancy_window_days,
          asOfMs,
          postedOptions,
        ),
      }))
      .sort((a, b) => b.active_count - a.active_count || a.zone.localeCompare(b.zone, "it"));

    const segments = computeSegmentGroups(
      all,
      cityConfig.market,
      ctx.occupancy_window_days,
      ctx.turnover_window_days,
      asOfMs,
      {
        flowMetricsReady: postedFlowReady,
        windowStartMs: occupancyWindowStartMs,
        turnoverWindowStartMs: occupancyWindowStartMs,
        snapshots: allSnapshots,
        occupancyWindowStartMs,
        cityActive: cityTotals.active_count,
        avgActiveOccupancy: null,
        avgActiveTurnover: null,
        metricsBasis: "posted",
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
      flow_metrics_ready: postedFlowReady,
      metrics_basis: "posted",
      occupancy_target_days: ctx.occupancy_target_days,
      turnover_target_days: ctx.turnover_target_days,
      turnover_window_days: ctx.turnover_window_days,
      occupancy_window_days: ctx.occupancy_window_days,
      areas,
      segments,
      ...cityTotals,
    };
  }

  const turnoverWindowStartMs = resolveWindowStartMs(
    asOfMs,
    ctx.turnover_window_days,
    ctx.tracking_started_at,
    period,
  );

  const avgActiveOccupancy = avgActiveInventoryInWindow(
    allSnapshots,
    ctx.occupancy_window_days,
    asOfMs,
    occupancyWindowStartMs,
  );
  const avgActiveTurnover = avgActiveInventoryInWindow(
    allSnapshots,
    ctx.turnover_window_days,
    asOfMs,
    turnoverWindowStartMs,
  );

  const cityAggregateOptions = buildAggregateOptions(
    ctx,
    avgActiveOccupancy,
    avgActiveTurnover,
    asOfMs,
    period,
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
      const zoneTurnoverBasis =
        computeScopedInventoryBasis(
          allSnapshots,
          turnoverWindowStartMs,
          asOfMs,
          (listing) => listingInZone(listing, zone, citySlug),
        ) ??
        zoneInventoryBasis(avgActiveTurnover, cityTotals.active_count, zoneActive);
      const zoneOccupancyBasis =
        computeScopedInventoryBasis(
          allSnapshots,
          occupancyWindowStartMs,
          asOfMs,
          (listing) => listingInZone(listing, zone, citySlug),
        ) ??
        zoneInventoryBasis(avgActiveOccupancy, cityTotals.active_count, zoneActive);
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
      snapshots: allSnapshots,
      occupancyWindowStartMs,
      turnoverWindowStartMs,
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
    metrics_basis: "tracking",
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
  return computeOccupancyMetrics(registry, {
    citySlug,
    period: DEFAULT_OCCUPANCY_METRICS_PERIOD,
  });
}

// Re-export constants for callers/tests that referenced them from metrics.
export { OCCUPANCY_WINDOW_DAYS, OCCUPANCY_TURNOVER_DAYS };
