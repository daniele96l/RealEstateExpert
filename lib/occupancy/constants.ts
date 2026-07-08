import path from "path";
import { listingsCacheSlug } from "@/lib/markets";

import { BATCH_FETCH_ALL_PAGES } from "@/lib/batch-fetch-pages";
import {
  DEFAULT_OCCUPANCY_PORTAL,
  type OccupancyPortal,
  isOccupancyPortal,
  OCCUPANCY_PORTALS,
} from "./portals";

export { DEFAULT_OCCUPANCY_PORTAL, type OccupancyPortal, isOccupancyPortal, OCCUPANCY_PORTALS };

export const OCCUPANCY_CITY = "Reggio Calabria";
export const OCCUPANCY_MARKET = "it" as const;
export const OCCUPANCY_WINDOW_DAYS = 90;
export const OCCUPANCY_TURNOVER_DAYS = 30;
/** 0 = fetch all pages up to hard cap */
export const OCCUPANCY_FETCH_MAX_PAGES = BATCH_FETCH_ALL_PAGES;
export const OCCUPANCY_FALLBACK_ZONE = "Altro";

const DATA_DIR = path.join(process.cwd(), "data", "occupancy");

function occupancyCityDir(): string {
  return path.join(DATA_DIR, listingsCacheSlug(OCCUPANCY_MARKET, OCCUPANCY_CITY));
}

export function occupancyDataDir(portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL): string {
  const base = occupancyCityDir();
  if (portal === "idealista") return base;
  return path.join(base, portal);
}

export function occupancyRegistryPath(portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL): string {
  return path.join(occupancyDataDir(portal), "registry.json");
}

export function occupancySnapshotsDir(portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL): string {
  return path.join(occupancyDataDir(portal), "snapshots");
}

export function occupancySnapshotPath(
  fetchedAt: string,
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): string {
  const safe = fetchedAt.replace(/[:.]/g, "-");
  return path.join(occupancySnapshotsDir(portal), `${safe}.json`);
}

export function occupancyRemovalsLogPath(
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): string {
  return path.join(occupancyDataDir(portal), "removals.json");
}

export function isOccupancyCityAllowed(city: string): boolean {
  return city.trim().toLowerCase() === OCCUPANCY_CITY.toLowerCase();
}
