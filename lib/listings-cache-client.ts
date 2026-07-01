import type { CityListingsCache } from "./types";

function cacheKey(city: string, operation: string): string {
  const slug = city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `realestate_listings_${slug}_${operation}`;
}

export function cacheFileLabel(city: string, operation: string): string {
  const slug = city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `data/listings/${slug}_${operation}.json`;
}

export function readLocalListingsCache(
  city: string,
  operation: "sale" | "rent",
): CityListingsCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(city, operation));
    if (!raw) return null;
    return JSON.parse(raw) as CityListingsCache;
  } catch {
    return null;
  }
}

export function writeLocalListingsCache(data: CityListingsCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(data.city, data.operation), JSON.stringify(data));
  } catch {
    /* quota exceeded — server JSON cache still available */
  }
}
