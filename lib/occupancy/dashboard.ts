import { computeOccupancyMetrics } from "./metrics";
import { buildBreakdownListings } from "./breakdown-listings-server";
import { buildMapListings } from "./map-listings";
import { buildPreviewFromSnapshot, resolveListingsPreview } from "./listings-preview";
import { buildOfferRateSeries } from "./offer-rate-series";
import {
  loadAllSnapshotFilesRaw,
  loadRegistry,
  summarizeSnapshots,
} from "./registry";
import { computeSnapshotDiff } from "./snapshot-diff";
import { rebuildRegistryFromSnapshots } from "./snapshot";
import {
  resolveOccupancyCitySlug,
  resolveOccupancyOperation,
  type OccupancyCitySlug,
  type OccupancyOperation,
} from "./constants";
import { getOccupancyCityConfig } from "./cities";
import { resolveOccupancyPortal } from "./portals";
import type { OccupancyDashboardData, OccupancySnapshot, OccupancySnapshotDiff } from "@/lib/types";
import {
  resolveOccupancyMetricsPeriod,
  type OccupancyMetricsPeriod,
} from "./metrics-period";
import { resolveOccupancyMetricsBasis } from "./metrics-basis";
import { isSnapshotExcluded, loadSnapshotMeta } from "./snapshot-meta";

function resolveSnapshotDiff(
  snapshots: OccupancySnapshot[],
  selected: string | null,
): OccupancySnapshotDiff | null {
  if (snapshots.length < 2) return null;

  if (selected) {
    const idx = snapshots.findIndex((s) => s.fetched_at === selected);
    const currentIdx = idx >= 0 ? idx : snapshots.length - 1;
    if (currentIdx < 1) return null;
    return computeSnapshotDiff(snapshots[currentIdx]!, snapshots[currentIdx - 1]!);
  }

  const latest = snapshots[snapshots.length - 1]!;
  const previous = snapshots[snapshots.length - 2]!;
  return computeSnapshotDiff(latest, previous);
}

function stripListingDescriptions<T extends { description?: string | null }>(
  listings: T[],
): T[] {
  return listings.map((listing) =>
    listing.description ? { ...listing, description: null } : listing,
  );
}

export async function loadOccupancyDashboard(
  asOf?: string | null,
  portalInput?: string | null,
  cityInput?: string | null,
  periodInput?: string | null,
  basisInput?: string | null,
  operationInput?: string | null,
): Promise<OccupancyDashboardData> {
  const citySlug: OccupancyCitySlug = resolveOccupancyCitySlug(cityInput);
  const cityConfig = getOccupancyCityConfig(citySlug);
  const portal = resolveOccupancyPortal(portalInput, citySlug);
  const period = resolveOccupancyMetricsPeriod(periodInput);
  const basis = resolveOccupancyMetricsBasis(basisInput);
  const operation: OccupancyOperation = resolveOccupancyOperation(operationInput);

  const [currentRegistry, allRawSnapshots, meta] = await Promise.all([
    loadRegistry(citySlug, portal, operation),
    loadAllSnapshotFilesRaw(citySlug, portal, operation),
    loadSnapshotMeta(citySlug, portal, operation),
  ]);

  const available_snapshots = summarizeSnapshots(allRawSnapshots, meta);
  const allSnapshots = allRawSnapshots.filter(
    (snapshot) => !isSnapshotExcluded(meta, snapshot.fetched_at),
  );

  const selected = asOf?.trim() || null;
  const latestSnapshot = allSnapshots[allSnapshots.length - 1] ?? null;
  const latestSnapshotAt = latestSnapshot?.fetched_at ?? null;
  let registry = currentRegistry;
  let listings_preview = await resolveListingsPreview(
    citySlug,
    portal,
    allSnapshots,
    currentRegistry.last_provider ?? null,
    operation,
  );

  if (selected) {
    const targetMs = new Date(selected).getTime();
    const snapshots = allSnapshots.filter((s) => new Date(s.fetched_at).getTime() <= targetMs);
    const match = snapshots.find((s) => s.fetched_at === selected) ?? snapshots[snapshots.length - 1];

    if (match && snapshots.length) {
      registry = rebuildRegistryFromSnapshots(
        snapshots,
        citySlug,
        portal,
        currentRegistry.last_provider ?? null,
      );
      listings_preview = buildPreviewFromSnapshot(
        match,
        currentRegistry.last_provider ?? null,
        citySlug,
      );
    }
  } else if (
    latestSnapshotAt &&
    new Date(currentRegistry.updated_at).getTime() < new Date(latestSnapshotAt).getTime() &&
    allSnapshots.length > 0
  ) {
    registry = rebuildRegistryFromSnapshots(
      allSnapshots,
      citySlug,
      portal,
      currentRegistry.last_provider ?? null,
    );
    listings_preview = buildPreviewFromSnapshot(
      latestSnapshot,
      currentRegistry.last_provider ?? null,
      citySlug,
    );
  }

  const [metrics, breakdown_listings] = await Promise.all([
    computeOccupancyMetrics(registry, {
      asOf: selected ?? latestSnapshotAt ?? registry.updated_at,
      citySlug,
      period,
      basis,
      operation,
      snapshots: allSnapshots,
    }),
    buildBreakdownListings(registry.listings, citySlug, portal, operation, {
      resolveMissingUrls: false,
      slim: true,
    }),
  ]);

  const snapshot_diff = resolveSnapshotDiff(allSnapshots, selected);
  const map_listings = buildMapListings(snapshot_diff, allSnapshots, selected);
  const offer_rate_series = buildOfferRateSeries(
    allSnapshots,
    cityConfig.market,
    operation,
  );

  const slim_snapshot_diff = snapshot_diff
    ? {
        ...snapshot_diff,
        listings: stripListingDescriptions(snapshot_diff.listings),
      }
    : null;

  const slim_listings_preview = listings_preview
    ? {
        ...listings_preview,
        sample: stripListingDescriptions(listings_preview.sample),
      }
    : null;

  return {
    metrics,
    listings_preview: slim_listings_preview,
    snapshot_diff: slim_snapshot_diff,
    map_listings,
    breakdown_listings,
    available_snapshots,
    offer_rate_series,
    selected_snapshot_at: selected,
    selected_portal: portal,
    selected_city: citySlug,
    selected_metrics_period: period,
    selected_metrics_basis: basis,
  };
}
