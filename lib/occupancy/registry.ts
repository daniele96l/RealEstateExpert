import { readdir } from "fs/promises";
import path from "path";
import type { OccupancyBasicListing, OccupancyRegistry, OccupancySnapshot, OccupancySnapshotSummary } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import {
  DEFAULT_OCCUPANCY_OPERATION,
  DEFAULT_OCCUPANCY_PORTAL,
  type OccupancyOperation,
  type OccupancyPortal,
  occupancyRegistryPath,
  occupancySnapshotPath,
  occupancySnapshotsDir,
} from "./constants";
import {
  defaultOccupancyCitySlug,
  getOccupancyCityConfig,
  type OccupancyCitySlug,
} from "./cities";
import { isSnapshotExcluded, loadSnapshotMeta, markSnapshotEdited } from "./snapshot-meta";

const SNAPSHOT_CACHE_TTL_MS = 60_000;

type SnapshotCacheEntry = {
  at: number;
  data: OccupancySnapshot[];
};

const snapshotFileCache = new Map<string, SnapshotCacheEntry>();
const snapshotFileInflight = new Map<string, Promise<OccupancySnapshot[]>>();

function snapshotCacheKey(
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
  operation: OccupancyOperation,
): string {
  return `${citySlug}|${portal}|${operation}`;
}

export function invalidateOccupancySnapshotCache(
  citySlug?: OccupancyCitySlug,
  portal?: OccupancyPortal,
  operation?: OccupancyOperation,
): void {
  if (!citySlug || !portal || !operation) {
    snapshotFileCache.clear();
    snapshotFileInflight.clear();
    return;
  }
  const key = snapshotCacheKey(citySlug, portal, operation);
  snapshotFileCache.delete(key);
  snapshotFileInflight.delete(key);
}

export function emptyRegistry(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): OccupancyRegistry {
  const { city, market } = getOccupancyCityConfig(citySlug);
  return {
    city,
    market,
    portal,
    updated_at: new Date().toISOString(),
    snapshot_count: 0,
    last_provider: null,
    listings: {},
  };
}

export async function loadRegistry(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancyRegistry> {
  const data = await readJsonFile<OccupancyRegistry>(
    occupancyRegistryPath(citySlug, portal, operation),
  );
  if (!data?.listings) return emptyRegistry(citySlug, portal);
  return { ...data, portal: data.portal ?? portal };
}

export async function saveRegistry(
  registry: OccupancyRegistry,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = registry.portal ?? DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<void> {
  await writeJsonFile(occupancyRegistryPath(citySlug, portal, operation), {
    ...registry,
    portal,
  });
}

export async function saveSnapshot(
  snapshot: OccupancySnapshot,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<void> {
  await writeJsonFile(
    occupancySnapshotPath(snapshot.fetched_at, citySlug, portal, operation),
    snapshot,
  );
  invalidateOccupancySnapshotCache(citySlug, portal, operation);
}

async function readAllSnapshotFilesFromDisk(
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
  operation: OccupancyOperation,
): Promise<OccupancySnapshot[]> {
  const dir = occupancySnapshotsDir(citySlug, portal, operation);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();
  const loaded = await Promise.all(
    jsonFiles.map((file) => readJsonFile<OccupancySnapshot>(path.join(dir, file))),
  );

  return loaded
    .filter((data): data is OccupancySnapshot => Boolean(data?.fetched_at))
    .sort((a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime());
}

export async function loadAllSnapshotFilesRaw(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancySnapshot[]> {
  const key = snapshotCacheKey(citySlug, portal, operation);
  const cached = snapshotFileCache.get(key);
  if (cached && Date.now() - cached.at < SNAPSHOT_CACHE_TTL_MS) {
    return cached.data;
  }

  const inflight = snapshotFileInflight.get(key);
  if (inflight) return inflight;

  const loadPromise = (async () => {
    try {
      const data = await readAllSnapshotFilesFromDisk(citySlug, portal, operation);
      snapshotFileCache.set(key, { at: Date.now(), data });
      return data;
    } finally {
      snapshotFileInflight.delete(key);
    }
  })();

  snapshotFileInflight.set(key, loadPromise);
  return loadPromise;
}

export async function loadSnapshotByFetchedAt(
  fetchedAt: string,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancySnapshot | null> {
  return readJsonFile<OccupancySnapshot>(
    occupancySnapshotPath(fetchedAt, citySlug, portal, operation),
  );
}

export async function updateSnapshotListings(
  fetchedAt: string,
  listings: OccupancyBasicListing[],
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  editNote?: string | null,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancySnapshot> {
  const existing = await loadSnapshotByFetchedAt(fetchedAt, citySlug, portal, operation);
  if (!existing) throw new Error("Snapshot not found");

  const snapshot: OccupancySnapshot = {
    ...existing,
    fetched_at: fetchedAt,
    listings,
    active_count: listings.length,
  };
  await saveSnapshot(snapshot, citySlug, portal, operation);
  await markSnapshotEdited(fetchedAt, citySlug, portal, editNote ?? null, operation);
  return snapshot;
}

export async function loadAllSnapshots(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancySnapshot[]> {
  const [raw, meta] = await Promise.all([
    loadAllSnapshotFilesRaw(citySlug, portal, operation),
    loadSnapshotMeta(citySlug, portal, operation),
  ]);
  return raw.filter((snapshot) => !isSnapshotExcluded(meta, snapshot.fetched_at));
}

export function summarizeSnapshots(
  snapshots: OccupancySnapshot[],
  meta: Awaited<ReturnType<typeof loadSnapshotMeta>>,
): OccupancySnapshotSummary[] {
  return [...snapshots]
    .map((snapshot) => ({
      fetched_at: snapshot.fetched_at,
      active_count: snapshot.active_count,
      excluded: isSnapshotExcluded(meta, snapshot.fetched_at),
      exclude_reason: meta.entries[snapshot.fetched_at]?.exclude_reason ?? null,
    }))
    .reverse();
}

export async function listSnapshotSummaries(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancySnapshotSummary[]> {
  const [snapshots, meta] = await Promise.all([
    loadAllSnapshotFilesRaw(citySlug, portal, operation),
    loadSnapshotMeta(citySlug, portal, operation),
  ]);
  return summarizeSnapshots(snapshots, meta);
}

export async function loadSnapshotsInWindow(
  days: number,
  asOfMs = Date.now(),
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancySnapshot[]> {
  const cutoff = asOfMs - days * 24 * 60 * 60 * 1000;
  const snapshots = await loadAllSnapshots(citySlug, portal, operation);
  return snapshots.filter((s) => {
    const t = new Date(s.fetched_at).getTime();
    return t >= cutoff && t <= asOfMs;
  });
}
