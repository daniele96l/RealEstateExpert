import { readdir } from "fs/promises";
import path from "path";
import type { OccupancyRegistry, OccupancySnapshot } from "@/lib/types";
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

export async function loadSnapshotsInWindow(days: number): Promise<OccupancySnapshot[]> {
  const dir = occupancySnapshotsDir();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const snapshots: OccupancySnapshot[] = [];

  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    const data = await readJsonFile<OccupancySnapshot>(path.join(dir, file));
    if (!data?.fetched_at) continue;
    if (new Date(data.fetched_at).getTime() < cutoff) continue;
    snapshots.push(data);
  }

  return snapshots;
}
