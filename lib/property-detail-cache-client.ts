import type { ListingDetail } from "./types";

function cacheKey(id: string): string {
  return `realestate_property_detail_${id}`;
}

export function propertyDetailCacheFileLabel(id: string): string {
  return `data/listings/details/${id}.json`;
}

export function readLocalPropertyDetailCache(id: string): ListingDetail | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as ListingDetail;
  } catch {
    return null;
  }
}

export function writeLocalPropertyDetailCache(detail: ListingDetail): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(detail.id), JSON.stringify(detail));
  } catch {
    /* quota exceeded — server JSON cache still available */
  }
}
