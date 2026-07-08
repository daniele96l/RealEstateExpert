import { readdir } from "fs/promises";
import path from "path";
import type { OccupancyRegistry, OccupancySnapshot, OccupancySnapshotSummary } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import {
  DEFAULT_OCCUPANCY_PORTAL,
  OCCUPANCY_CITY,
  OCCUPANCY_MARKET,
  type OccupancyPortal,
  occupancyRegistryPath,
  occupancySnapshotPath,
  occupancySnapshotsDir,
} from "./constants";

export function emptyRegistry(portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL): OccupancyRegistry {
  return {
    city: OCCUPANCY_CITY,
    market: OCCUPANCY_MARKET,
    portal,
    updated_at: new Date().toISOString(),
    snapshot_count: 0,
    last_provider: null,
    listings: {},
  };
}

export async function loadRegistry(
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancyRegistry> {
  const data = await readJsonFile<OccupancyRegistry>(occupancyRegistryPath(portal));
  if (!data?.listings) return emptyRegistry(portal);
  return { ...data, portal: data.portal ?? portal };
}

export async function saveRegistry(
  registry: OccupancyRegistry,
  portal: OccupancyPortal = registry.portal ?? DEFAULT_OCCUPANCY_PORTAL,
): Promise<void> {
  await writeJsonFile(occupancyRegistryPath(portal), { ...registry, portal });
}

export async function saveSnapshot(
  snapshot: OccupancySnapshot,
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<void> {
  await writeJsonFile(occupancySnapshotPath(snapshot.fetched_at, portal), snapshot);
}

export async function loadAllSnapshots(
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancySnapshot[]> {
  const dir = occupancySnapshotsDir(portal);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const snapshots: OccupancySnapshot[] = [];
  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    const data = await readJsonFile<OccupancySnapshot>(path.join(dir, file));
    if (!data?.fetched_at) continue;
    snapshots.push(data);
  }

  return snapshots.sort(
    (a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime(),
  );
}

export async function listSnapshotSummaries(
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancySnapshotSummary[]> {
  const snapshots = await loadAllSnapshots(portal);
  return [...snapshots]
    .map((s) => ({ fetched_at: s.fetched_at, active_count: s.active_count }))
    .reverse();
}

export async function loadSnapshotsInWindow(
  days: number,
  asOfMs = Date.now(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancySnapshot[]> {
  const cutoff = asOfMs - days * 24 * 60 * 60 * 1000;
  const snapshots = await loadAllSnapshots(portal);
  return snapshots.filter((s) => {
    const t = new Date(s.fetched_at).getTime();
    return t >= cutoff && t <= asOfMs;
  });
}
