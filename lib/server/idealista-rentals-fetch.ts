import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { fetchCityListingsViaDirect } from "@/lib/server/idealista-direct";
import type { CityListingsCache } from "@/lib/types";

export class IdealistaRentalsFetchError extends Error {}

export interface IdealistaRentalsFetchProgress {
  page: number;
  maxPages: number;
  listingsTotal: number;
}

export async function fetchIdealistaScraperListings(
  maxPages: number,
  onProgress?: (progress: IdealistaRentalsFetchProgress) => void,
): Promise<CityListingsCache> {
  const resolvedMaxPages = Math.min(resolveItalyListingMaxPages(maxPages), 10);

  const data = await fetchCityListingsViaDirect(
    "Reggio Calabria",
    "rent",
    resolvedMaxPages,
    (pageProgress) => {
      onProgress?.({
        page: pageProgress.page,
        maxPages: pageProgress.maxPages,
        listingsTotal: pageProgress.listingsTotal,
      });
    },
    { forceNavigation: true },
  );

  return {
    ...data,
    city: "reggio_calabria",
    provider: "idealista_scraper",
  };
}
