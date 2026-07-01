import type { MarketPriceHistory } from "./types";

function citySlug(city: string): string {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function cacheKey(city: string): string {
  return `realestate_market_${citySlug(city)}`;
}

export function marketCacheFileLabel(city: string): string {
  return `data/market/${citySlug(city)}.json`;
}

export function readLocalMarketCache(city: string): MarketPriceHistory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(city));
    if (!raw) return null;
    return JSON.parse(raw) as MarketPriceHistory;
  } catch {
    return null;
  }
}

export function writeLocalMarketCache(data: MarketPriceHistory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(data.city), JSON.stringify(data));
  } catch {
    /* quota exceeded — server JSON cache still available */
  }
}
