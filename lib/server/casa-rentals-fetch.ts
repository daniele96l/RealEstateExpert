import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { fetchCasaCityListings } from "@/lib/server/casa-search";
import type { CityListingsCache } from "@/lib/types";

export class CasaRentalsFetchError extends Error {}

export interface CasaRentalsFetchProgress {
  page: number;
  maxPages: number;
  listingsTotal: number;
}

export async function fetchCasaScraperListings(
  maxPages: number,
  onProgress?: (progress: CasaRentalsFetchProgress) => void,
): Promise<CityListingsCache> {
  const resolvedMaxPages = Math.min(resolveItalyListingMaxPages(maxPages), 10);

  return fetchCasaCityListings(resolvedMaxPages, (pageProgress) => {
    onProgress?.({
      page: pageProgress.page,
      maxPages: pageProgress.maxPages,
      listingsTotal: pageProgress.listingsTotal,
    });
  });
}
