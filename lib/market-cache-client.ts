import type { MarketPriceHistory } from "./types";
import type { MarketId } from "./markets";
import { listingsCacheSlug } from "./markets";

function citySlug(city: string): string {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function cacheKey(city: string, market: MarketId = "it"): string {
  return `realestate_market_${market}_${citySlug(city)}`;
}

export function marketCacheFileLabel(city: string, market: MarketId = "it"): string {
  const slug = market === "cz" ? listingsCacheSlug(market, city) : citySlug(city);
  return `data/market/${slug}.json`;
}

export function readLocalMarketCache(city: string, market: MarketId = "it"): MarketPriceHistory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(city, market));
    if (!raw) return null;
    return JSON.parse(raw) as MarketPriceHistory;
  } catch {
    return null;
  }
}

export function writeLocalMarketCache(data: MarketPriceHistory, market: MarketId = "it"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(data.city, market), JSON.stringify(data));
  } catch {
    /* quota exceeded — server JSON cache still available */
  }
}
