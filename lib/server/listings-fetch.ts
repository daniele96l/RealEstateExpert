import { fetchCityListings, IdealistaSearchError } from "@/lib/server/idealista-search";
import { hasScrapingBeeKey, getDefaultListingsProvider, isRapidApiEnabled } from "@/lib/server/config";
import { noteRapidApiError, shouldSkipRapidApi } from "@/lib/server/provider-quota";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import type { CityListingsCache, ListingsProvider } from "@/lib/types";

export function buildSearchQuery(city: string, zone?: string | null): string {
  const trimmedCity = city.trim();
  const trimmedZone = zone?.trim();
  if (trimmedZone) return `${trimmedZone}, ${trimmedCity}`;
  return trimmedCity;
}

export async function fetchWithFallback(
  city: string,
  operation: "sale" | "rent",
  preferred: ListingsProvider,
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
): Promise<{ data: CityListingsCache; provider: ListingsProvider }> {
  const order: ListingsProvider[] =
    preferred === "rapidapi" ? ["rapidapi", "scrapingbee"] : ["scrapingbee", "rapidapi"];

  const available = order.filter((p) => {
    if (p === "rapidapi") return isRapidApiEnabled() && !shouldSkipRapidApi();
    return hasScrapingBeeKey();
  });
  if (!available.length) {
    throw new Error("Nessuna API configurata. Aggiungi RAPIDAPI_KEY o SCRAPINGBEE_API_KEY in .env.local");
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      const data = await fetchCityListings(city, operation, provider, maxPages, onPage);
      return { data, provider };
    } catch (err) {
      noteRapidApiError(err);
      lastError = err;
    }
  }

  throw lastError ?? new IdealistaSearchError(`Impossibile recuperare annunci per ${city}`);
}

export function resolvePreferredProvider(preferred?: ListingsProvider): ListingsProvider {
  return preferred ?? getDefaultListingsProvider();
}
