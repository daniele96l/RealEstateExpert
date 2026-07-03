import path from "path";
import { readdir } from "node:fs/promises";
import type { CityListingsCache, ListingDetail, MapListing } from "@/lib/types";
import { enrichListingFromDetail, normalizeListingCondition } from "@/lib/listing-condition-enrich";
import { getPropertyDetailCache } from "./property-detail-cache";
import { readJsonFile, writeJsonFile } from "./fs-cache-io";
import { listingsCacheSlug, type MarketId } from "@/lib/markets";
import { normalizeCitySlug } from "./geocode";

const DATA_DIR = path.join(process.cwd(), "data", "listings");

function cacheFilePath(market: MarketId, city: string, operation: string): string {
  return path.join(
    DATA_DIR,
    `${listingsCacheSlug(market, city)}_${operation}.json`,
  );
}

function legacyCacheFilePath(city: string, operation: string): string {
  return path.join(DATA_DIR, `${normalizeCitySlug(city)}_${operation}.json`);
}

export async function enrichListingFromDetailCache(listing: MapListing): Promise<MapListing> {
  const detail = await getPropertyDetailCache(listing.id);
  if (detail) return enrichListingFromDetail(listing, detail);
  return normalizeListingCondition(listing);
}

export async function enrichListingsFromDetailCache(listings: MapListing[]): Promise<MapListing[]> {
  return Promise.all(listings.map((listing) => enrichListingFromDetailCache(listing)));
}

export async function enrichCityListingsCache(cache: CityListingsCache): Promise<CityListingsCache> {
  return {
    ...cache,
    listings: await enrichListingsFromDetailCache(cache.listings),
  };
}

export async function syncListingConditionToCityCaches(detail: ListingDetail): Promise<void> {
  let files: string[];
  try {
    files = await readdir(DATA_DIR);
  } catch {
    return;
  }

  await Promise.all(
    files
      .filter((file) => file.endsWith("_sale.json") || file.endsWith("_rent.json"))
      .map(async (file) => {
        const filePath = path.join(DATA_DIR, file);
        const cache = await readJsonFile<CityListingsCache>(filePath);
        if (!cache) return;

        const idx = cache.listings.findIndex((listing) => listing.id === detail.id);
        if (idx === -1) return;

        const listings = [...cache.listings];
        listings[idx] = enrichListingFromDetail(listings[idx], detail);
        await writeJsonFile(filePath, { ...cache, listings });
      }),
  );
}

export async function getEnrichedCache(
  market: MarketId,
  city: string,
  operation: string,
): Promise<CityListingsCache | null> {
  let cache = await readJsonFile<CityListingsCache>(cacheFilePath(market, city, operation));
  if (!cache && market === "it") {
    cache = await readJsonFile<CityListingsCache>(legacyCacheFilePath(city, operation));
  }
  if (!cache) return null;
  return enrichCityListingsCache(cache);
}
