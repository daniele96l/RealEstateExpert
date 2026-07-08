import path from "path";
import { listingsCacheSlug } from "@/lib/markets";

export const OCCUPANCY_CITY = "Reggio Calabria";
export const OCCUPANCY_MARKET = "it" as const;
export const OCCUPANCY_WINDOW_DAYS = 90;
export const OCCUPANCY_TURNOVER_DAYS = 30;
export const OCCUPANCY_FETCH_MAX_PAGES = 5;
export const OCCUPANCY_FALLBACK_ZONE = "Altro";

const DATA_DIR = path.join(process.cwd(), "data", "occupancy");

export function occupancyDataDir(): string {
  return path.join(DATA_DIR, listingsCacheSlug(OCCUPANCY_MARKET, OCCUPANCY_CITY));
}

export function occupancyRegistryPath(): string {
  return path.join(occupancyDataDir(), "registry.json");
}

export function occupancySnapshotsDir(): string {
  return path.join(occupancyDataDir(), "snapshots");
}

export function occupancySnapshotPath(fetchedAt: string): string {
  const safe = fetchedAt.replace(/[:.]/g, "-");
  return path.join(occupancySnapshotsDir(), `${safe}.json`);
}

export function isOccupancyCityAllowed(city: string): boolean {
  return city.trim().toLowerCase() === OCCUPANCY_CITY.toLowerCase();
}
