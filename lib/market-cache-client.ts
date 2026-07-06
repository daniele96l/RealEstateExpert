import type { MarketPriceHistory } from "./types";
import type { MarketId } from "./markets";
import { listingsCacheSlug } from "./markets";
import { marketCacheFileSlugs, marketCitySlug } from "./market-cache-slugs";

function cacheKey(slug: string, market: MarketId = "it"): string {
  return `realestate_market_${market}_${slug}`;
}

export function marketCacheFileLabel(city: string, market: MarketId = "it"): string {
  const slug = marketCacheFileSlugs(city, market)[0] ?? marketCitySlug(city);
  return `data/market/${slug}.json`;
}

export function readLocalMarketCache(city: string, market: MarketId = "it"): MarketPriceHistory | null {
  if (typeof window === "undefined") return null;
  try {
    for (const slug of marketCacheFileSlugs(city, market)) {
      const raw = localStorage.getItem(cacheKey(slug, market));
      if (!raw) continue;
      return JSON.parse(raw) as MarketPriceHistory;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLocalMarketCache(data: MarketPriceHistory, market: MarketId = "it"): void {
  if (typeof window === "undefined") return;
  try {
    const slug =
      data.city_slug?.replace(/-/g, "_") ||
      (market === "cz" ? listingsCacheSlug(market, data.city) : marketCitySlug(data.city));
    localStorage.setItem(cacheKey(slug, market), JSON.stringify(data));
  } catch {
    /* quota exceeded — server JSON cache still available */
  }
}
