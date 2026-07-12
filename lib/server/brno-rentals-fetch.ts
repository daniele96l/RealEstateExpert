import { resolveBatchFetchPageLimit } from "@/lib/batch-fetch-pages";
import { fetchSrealityCityListings } from "@/lib/server/sreality-search";
import type { CityListingsCache } from "@/lib/types";
import { getOccupancyCityConfig, type OccupancyCitySlug } from "@/lib/occupancy/cities";

export class BrnoRentalsFetchError extends Error {}

export interface BrnoRentalsFetchProgress {
  page: number;
  maxPages: number;
  listingsTotal: number;
}

export async function fetchSrealityRentalsListings(
  citySlug: OccupancyCitySlug,
  maxPages: number,
  onProgress?: (progress: BrnoRentalsFetchProgress) => void,
): Promise<CityListingsCache> {
  const { city, market } = getOccupancyCityConfig(citySlug);
  const resolvedMaxPages = resolveBatchFetchPageLimit(maxPages, market);

  return fetchSrealityCityListings(city, "rent", market, {
    maxPages: resolvedMaxPages,
    onPage: (pageProgress) => {
      onProgress?.({
        page: pageProgress.page,
        maxPages: pageProgress.maxPages,
        listingsTotal: pageProgress.listingsTotal,
      });
    },
  });
}

/** @deprecated Use fetchSrealityRentalsListings("brno", …) */
export async function fetchBrnoRentalsListings(
  maxPages: number,
  onProgress?: (progress: BrnoRentalsFetchProgress) => void,
): Promise<CityListingsCache> {
  return fetchSrealityRentalsListings("brno", maxPages, onProgress);
}
