import type { OccupancySnapshotMetaEntry, OccupancySnapshotMetaFile } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import { DEFAULT_OCCUPANCY_PORTAL, occupancySnapshotsMetaPath, type OccupancyPortal } from "./constants";
import { defaultOccupancyCitySlug, type OccupancyCitySlug } from "./cities";

const EMPTY_META: OccupancySnapshotMetaFile = { entries: {} };

export async function loadSnapshotMeta(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancySnapshotMetaFile> {
  const data = await readJsonFile<OccupancySnapshotMetaFile>(occupancySnapshotsMetaPath(citySlug, portal));
  if (!data?.entries) return { ...EMPTY_META };
  return data;
}

export async function saveSnapshotMeta(
  meta: OccupancySnapshotMetaFile,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<void> {
  await writeJsonFile(occupancySnapshotsMetaPath(citySlug, portal), meta);
}

export function snapshotMetaEntry(
  meta: OccupancySnapshotMetaFile,
  fetchedAt: string,
): OccupancySnapshotMetaEntry {
  return meta.entries[fetchedAt] ?? {};
}

export function isSnapshotExcluded(meta: OccupancySnapshotMetaFile, fetchedAt: string): boolean {
  return !!meta.entries[fetchedAt]?.excluded;
}

export async function setSnapshotExcluded(
  fetchedAt: string,
  excluded: boolean,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  reason?: string | null,
): Promise<void> {
  const meta = await loadSnapshotMeta(citySlug, portal);
  const existing = meta.entries[fetchedAt] ?? {};

  if (excluded) {
    meta.entries[fetchedAt] = {
      ...existing,
      excluded: true,
      exclude_reason: reason?.trim() || null,
      excluded_at: new Date().toISOString(),
    };
  } else {
    const { excluded: _e, exclude_reason: _r, excluded_at: _a, ...rest } = existing;
    if (Object.keys(rest).length) meta.entries[fetchedAt] = rest;
    else delete meta.entries[fetchedAt];
  }

  await saveSnapshotMeta(meta, citySlug, portal);
}

export async function markSnapshotEdited(
  fetchedAt: string,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  note?: string | null,
): Promise<void> {
  const meta = await loadSnapshotMeta(citySlug, portal);
  meta.entries[fetchedAt] = {
    ...meta.entries[fetchedAt],
    edited_at: new Date().toISOString(),
    edit_note: note?.trim() || meta.entries[fetchedAt]?.edit_note || null,
  };
  await saveSnapshotMeta(meta, citySlug, portal);
}
