import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { fetchSubitoCityListings } from "@/lib/server/subito-search";
import type { CityListingsCache } from "@/lib/types";

export class SubitoRentalsFetchError extends Error {}

export interface SubitoRentalsFetchProgress {
  page: number;
  maxPages: number;
  listingsTotal: number;
}

export async function fetchSubitoScraperListings(
  maxPages: number,
  onProgress?: (progress: SubitoRentalsFetchProgress) => void,
): Promise<CityListingsCache> {
  const resolvedMaxPages = Math.min(resolveItalyListingMaxPages(maxPages), 10);

  return fetchSubitoCityListings(resolvedMaxPages, (pageProgress) => {
    onProgress?.({
      page: pageProgress.page,
      maxPages: pageProgress.maxPages,
      listingsTotal: pageProgress.listingsTotal,
    });
  });
}
