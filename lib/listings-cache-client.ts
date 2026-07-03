import type { CityListingsCache } from "./types";
import { listingsCacheSlug, type MarketId } from "./markets";

function cacheKey(market: MarketId, city: string, operation: string): string {
  return `realestate_listings_${listingsCacheSlug(market, city)}_${operation}`;
}

export function cacheFileLabel(market: MarketId, city: string, operation: string): string {
  return `data/listings/${listingsCacheSlug(market, city)}_${operation}.json`;
}

export function readLocalListingsCache(
  market: MarketId,
  city: string,
  operation: "sale" | "rent",
): CityListingsCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(market, city, operation));
    if (!raw) return null;
    return JSON.parse(raw) as CityListingsCache;
  } catch {
    return null;
  }
}

export function writeLocalListingsCache(
  market: MarketId,
  data: CityListingsCache,
): void {
  if (typeof window === "undefined") return;
  try {
    const slug = data.city.includes("_") ? data.city : listingsCacheSlug(market, data.city);
    localStorage.setItem(
      cacheKey(market, slug, data.operation),
      JSON.stringify({ ...data, city: slug }),
    );
  } catch {
    /* quota exceeded — server JSON cache still available */
  }
}

export function clearLocalListingsCacheForMarket(market: MarketId): void {
  if (typeof window === "undefined") return;
  const prefix = `realestate_listings_${market}_`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}
