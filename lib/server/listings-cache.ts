import path from "path";
import type { CityListingsCache, MapListing } from "@/lib/types";
import { listingsCacheSlug, type MarketId } from "@/lib/markets";
import { mergeListingCondition } from "@/lib/listing-condition-enrich";
import { normalizeCitySlug } from "./geocode";
import { readJsonFile, writeJsonFile } from "./fs-cache-io";

const DATA_DIR = path.join(process.cwd(), "data", "listings");

function cacheFilePath(market: MarketId, city: string, operation: string): string {
  return path.join(DATA_DIR, `${listingsCacheSlug(market, city)}_${operation}.json`);
}

function legacyCacheFilePath(city: string, operation: string): string {
  return path.join(DATA_DIR, `${normalizeCitySlug(city)}_${operation}.json`);
}

export function resolveCacheCitySlug(market: MarketId, city: string): string {
  return listingsCacheSlug(market, city);
}

export function mergeListings(existing: MapListing[], incoming: MapListing[]): MapListing[] {
  const byId = new Map<string, MapListing>();
  for (const listing of existing) byId.set(listing.id, listing);
  for (const listing of incoming) {
    const prev = byId.get(listing.id);
    byId.set(listing.id, prev ? mergeListingCondition(listing, prev) : listing);
  }
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

/** Replace cache on refresh: keep only incoming listings, preserve condition from prior entries. */
export function replaceListingCache(
  existing: CityListingsCache | null,
  incoming: CityListingsCache,
): CityListingsCache {
  const existingById = new Map((existing?.listings ?? []).map((l) => [l.id, l]));
  return {
    ...incoming,
    listings: incoming.listings.map((listing) => {
      const prev = existingById.get(listing.id);
      return prev ? mergeListingCondition(listing, prev) : listing;
    }),
    fetched_at: incoming.fetched_at,
  };
}

export async function getCache(
  market: MarketId,
  city: string,
  operation: string,
): Promise<CityListingsCache | null> {
  const primary = await readJsonFile<CityListingsCache>(cacheFilePath(market, city, operation));
  if (primary) return primary;
  if (market === "it") {
    return readJsonFile<CityListingsCache>(legacyCacheFilePath(city, operation));
  }
  return null;
}

export async function saveCache(data: CityListingsCache, market: MarketId = "it"): Promise<void> {
  const slug = data.city.includes("_") ? data.city : listingsCacheSlug(market, data.city);
  await writeJsonFile(
    path.join(DATA_DIR, `${slug}_${data.operation}.json`),
    { ...data, city: slug },
  );
}
