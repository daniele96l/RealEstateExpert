import { computeOccupancyMetrics } from "./metrics";
import { buildMapListings } from "./map-listings";
import { buildPreviewFromSnapshot, resolveListingsPreview } from "./listings-preview";
import { listSnapshotSummaries, loadAllSnapshots, loadRegistry } from "./registry";
import { computeSnapshotDiff } from "./snapshot-diff";
import { rebuildRegistryFromSnapshots } from "./snapshot";
import {
  DEFAULT_OCCUPANCY_PORTAL,
  isOccupancyPortal,
  type OccupancyPortal,
} from "./constants";
import type { OccupancyDashboardData, OccupancySnapshotDiff } from "@/lib/types";

function resolveSnapshotDiff(
  snapshots: Awaited<ReturnType<typeof loadAllSnapshots>>,
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

export async function loadOccupancyDashboard(
  asOf?: string | null,
  portalInput?: string | null,
): Promise<OccupancyDashboardData> {
  const portal: OccupancyPortal = isOccupancyPortal(portalInput)
    ? portalInput
    : DEFAULT_OCCUPANCY_PORTAL;

  const [currentRegistry, available_snapshots, allSnapshots] = await Promise.all([
    loadRegistry(portal),
    listSnapshotSummaries(portal),
    loadAllSnapshots(portal),
  ]);

  const selected = asOf?.trim() || null;
  let registry = currentRegistry;
  let listings_preview = await resolveListingsPreview(
    portal,
    allSnapshots,
    currentRegistry.last_provider ?? null,
  );

  if (selected) {
    const targetMs = new Date(selected).getTime();
    const snapshots = allSnapshots.filter((s) => new Date(s.fetched_at).getTime() <= targetMs);
    const match = snapshots.find((s) => s.fetched_at === selected) ?? snapshots[snapshots.length - 1];

    if (match && snapshots.length) {
      registry = rebuildRegistryFromSnapshots(
        snapshots,
        portal,
        currentRegistry.last_provider ?? null,
      );
      listings_preview = buildPreviewFromSnapshot(match, currentRegistry.last_provider ?? null);
    }
  }

  const metrics = await computeOccupancyMetrics(registry, {
    asOf: selected ?? registry.updated_at,
  });

  const snapshot_diff = resolveSnapshotDiff(allSnapshots, selected);
  const map_listings = buildMapListings(snapshot_diff, allSnapshots, selected);

  return {
    metrics,
    listings_preview,
    snapshot_diff,
    map_listings,
    available_snapshots,
    selected_snapshot_at: selected,
    selected_portal: portal,
  };
}
