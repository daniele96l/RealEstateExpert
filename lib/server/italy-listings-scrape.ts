import type { ListingSource } from "@/lib/listing-url";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import type { CityListingsCache } from "@/lib/types";
import { fetchCityListingsViaDirect } from "./idealista-direct";
import { fetchImmobiliareCityListings } from "./immobiliare-search";

export async function fetchItalyListingsScraped(
  city: string,
  operation: "sale" | "rent",
  portal: ListingSource,
  maxPages?: number,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  if (portal === "immobiliare") {
    const data = await fetchImmobiliareCityListings(city, operation, {
      maxPages,
      onPage,
    });
    return { ...data, provider: "direct" };
  }

  const data = await fetchCityListingsViaDirect(city, operation, maxPages ?? 1, onPage, {
    forceNavigation: true,
  });
  return { ...data, provider: "direct" };
}
