import type { OccupancySnapshotMetaEntry, OccupancySnapshotMetaFile } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import {
  DEFAULT_OCCUPANCY_OPERATION,
  DEFAULT_OCCUPANCY_PORTAL,
  occupancySnapshotsMetaPath,
  type OccupancyOperation,
  type OccupancyPortal,
} from "./constants";
import { defaultOccupancyCitySlug, type OccupancyCitySlug } from "./cities";

const EMPTY_META: OccupancySnapshotMetaFile = { entries: {} };

export async function loadSnapshotMeta(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancySnapshotMetaFile> {
  const data = await readJsonFile<OccupancySnapshotMetaFile>(
    occupancySnapshotsMetaPath(citySlug, portal, operation),
  );
  if (!data?.entries) return { ...EMPTY_META };
  return data;
}

export async function saveSnapshotMeta(
  meta: OccupancySnapshotMetaFile,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<void> {
  await writeJsonFile(occupancySnapshotsMetaPath(citySlug, portal, operation), meta);
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
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<void> {
  const meta = await loadSnapshotMeta(citySlug, portal, operation);
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

  await saveSnapshotMeta(meta, citySlug, portal, operation);
}

export async function markSnapshotEdited(
  fetchedAt: string,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  note?: string | null,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<void> {
  const meta = await loadSnapshotMeta(citySlug, portal, operation);
  meta.entries[fetchedAt] = {
    ...meta.entries[fetchedAt],
    edited_at: new Date().toISOString(),
    edit_note: note?.trim() || meta.entries[fetchedAt]?.edit_note || null,
  };
  await saveSnapshotMeta(meta, citySlug, portal, operation);
}
