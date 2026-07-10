import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import type { ListingSource } from "@/lib/listing-url";
import type { CityListingsCache, ListingsProvider } from "@/lib/types";
import { fetchItalyListingsScraped } from "./italy-listings-scrape";

export function buildSearchQuery(city: string, zone?: string | null): string {
  const trimmedCity = city.trim();
  const trimmedZone = zone?.trim();
  if (trimmedZone) return `${trimmedZone}, ${trimmedCity}`;
  return trimmedCity;
}

export function resolvePreferredProvider(_provider?: ListingsProvider): ListingsProvider {
  return "direct";
}

export async function fetchListingsScraped(
  city: string,
  operation: "sale" | "rent",
  portal: ListingSource,
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  return fetchItalyListingsScraped(city, operation, portal, maxPages, onPage);
}
