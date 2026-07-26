import path from "path";
import { listingsCacheSlug } from "@/lib/markets";

import { BATCH_FETCH_ALL_PAGES } from "@/lib/batch-fetch-pages";
import {
  DEFAULT_OCCUPANCY_PORTAL,
  type OccupancyPortal,
  isOccupancyPortal,
  OCCUPANCY_PORTALS,
} from "./portals";
import {
  defaultOccupancyCitySlug,
  getOccupancyCityConfig,
  isOccupancyCityAllowed,
  isOccupancyCitySlug,
  resolveOccupancyCitySlug,
  type OccupancyCitySlug,
} from "./cities";
import {
  DEFAULT_OCCUPANCY_OPERATION,
  isOccupancyOperation,
  resolveOccupancyOperation,
  type OccupancyOperation,
} from "./operation";

export {
  DEFAULT_OCCUPANCY_PORTAL,
  type OccupancyPortal,
  isOccupancyPortal,
  OCCUPANCY_PORTALS,
  isOccupancyCityAllowed,
  isOccupancyCitySlug,
  resolveOccupancyCitySlug,
  type OccupancyCitySlug,
  DEFAULT_OCCUPANCY_OPERATION,
  isOccupancyOperation,
  resolveOccupancyOperation,
  type OccupancyOperation,
};

/** @deprecated Use getOccupancyCityConfig(slug).city */
export const OCCUPANCY_CITY = "Reggio Calabria";
/** @deprecated Use getOccupancyCityConfig(slug).market */
export const OCCUPANCY_MARKET = "it" as const;

export const OCCUPANCY_WINDOW_DAYS = 90;
export const OCCUPANCY_TURNOVER_DAYS = 30;
/** 0 = fetch all pages up to hard cap */
export const OCCUPANCY_FETCH_MAX_PAGES = BATCH_FETCH_ALL_PAGES;
export const OCCUPANCY_FALLBACK_ZONE = "Altro";

function trackingDataRoot(operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION): string {
  return path.join(
    process.cwd(),
    "data",
    operation === "sale" ? "sale-rate" : "occupancy",
  );
}

function occupancyCityDir(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): string {
  const { market, city } = getOccupancyCityConfig(citySlug);
  return path.join(trackingDataRoot(operation), listingsCacheSlug(market, city));
}

export function occupancyDataDir(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): string {
  return path.join(occupancyCityDir(citySlug, operation), portal);
}

export function occupancyRegistryPath(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): string {
  return path.join(occupancyDataDir(citySlug, portal, operation), "registry.json");
}

export function occupancySnapshotsDir(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): string {
  return path.join(occupancyDataDir(citySlug, portal, operation), "snapshots");
}

export function occupancySnapshotPath(
  fetchedAt: string,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): string {
  const safe = fetchedAt.replace(/[:.]/g, "-");
  return path.join(occupancySnapshotsDir(citySlug, portal, operation), `${safe}.json`);
}

export function occupancyRemovalsLogPath(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): string {
  return path.join(occupancyDataDir(citySlug, portal, operation), "removals.json");
}

export function occupancySnapshotsMetaPath(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): string {
  return path.join(occupancyDataDir(citySlug, portal, operation), "snapshots-meta.json");
}
