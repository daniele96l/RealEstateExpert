import path from "path";
import type { CityListingsCache, MapListing } from "@/lib/types";
import { normalizeCitySlug } from "./geocode";
import { readJsonFile, writeJsonFile } from "./fs-cache-io";

const DATA_DIR = path.join(process.cwd(), "data", "listings");

function cacheFilePath(city: string, operation: string): string {
  return path.join(DATA_DIR, `${normalizeCitySlug(city)}_${operation}.json`);
}

export function mergeListings(existing: MapListing[], incoming: MapListing[]): MapListing[] {
  const byId = new Map<string, MapListing>();
  for (const listing of existing) byId.set(listing.id, listing);
  for (const listing of incoming) byId.set(listing.id, listing);
  return [...byId.values()];
}

export function mergeListingCache(
  existing: CityListingsCache | null,
  incoming: CityListingsCache,
): CityListingsCache {
  return {
    ...incoming,
    listings: mergeListings(existing?.listings ?? [], incoming.listings),
    fetched_at: incoming.fetched_at,
  };
}

export async function getCache(city: string, operation: string): Promise<CityListingsCache | null> {
  return readJsonFile<CityListingsCache>(cacheFilePath(city, operation));
}

export async function saveCache(data: CityListingsCache): Promise<void> {
  await writeJsonFile(cacheFilePath(data.city, data.operation), data);
}
