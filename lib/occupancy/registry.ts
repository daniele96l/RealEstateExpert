import { readdir } from "fs/promises";
import path from "path";
import type { OccupancyRegistry, OccupancySnapshot, OccupancySnapshotSummary } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import {
  OCCUPANCY_CITY,
  OCCUPANCY_MARKET,
  occupancyRegistryPath,
  occupancySnapshotPath,
  occupancySnapshotsDir,
} from "./constants";

export function emptyRegistry(): OccupancyRegistry {
  return {
    city: OCCUPANCY_CITY,
    market: OCCUPANCY_MARKET,
    updated_at: new Date().toISOString(),
    snapshot_count: 0,
    last_provider: null,
    listings: {},
  };
}

export async function loadRegistry(): Promise<OccupancyRegistry> {
  const data = await readJsonFile<OccupancyRegistry>(occupancyRegistryPath());
  if (!data?.listings) return emptyRegistry();
  return data;
}

export async function saveRegistry(registry: OccupancyRegistry): Promise<void> {
  await writeJsonFile(occupancyRegistryPath(), registry);
}

export async function saveSnapshot(snapshot: OccupancySnapshot): Promise<void> {
  await writeJsonFile(occupancySnapshotPath(snapshot.fetched_at), snapshot);
}

export async function loadAllSnapshots(): Promise<OccupancySnapshot[]> {
  const dir = occupancySnapshotsDir();
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

export async function listSnapshotSummaries(): Promise<OccupancySnapshotSummary[]> {
  const snapshots = await loadAllSnapshots();
  return [...snapshots]
    .map((s) => ({ fetched_at: s.fetched_at, active_count: s.active_count }))
    .reverse();
}

export async function loadSnapshotsInWindow(
  days: number,
  asOfMs = Date.now(),
): Promise<OccupancySnapshot[]> {
  const cutoff = asOfMs - days * 24 * 60 * 60 * 1000;
  const snapshots = await loadAllSnapshots();
  return snapshots.filter((s) => {
    const t = new Date(s.fetched_at).getTime();
    return t >= cutoff && t <= asOfMs;
  });
}
