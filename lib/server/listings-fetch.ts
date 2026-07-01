import { fetchCityListings, IdealistaSearchError } from "@/lib/server/idealista-search";
import { hasRapidApiKey, hasScrapingBeeKey, getDefaultListingsProvider } from "@/lib/server/config";
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
): Promise<{ data: CityListingsCache; provider: ListingsProvider }> {
  const order: ListingsProvider[] =
    preferred === "rapidapi" ? ["rapidapi", "scrapingbee"] : ["scrapingbee", "rapidapi"];

  const available = order.filter((p) => (p === "rapidapi" ? hasRapidApiKey() : hasScrapingBeeKey()));
  if (!available.length) {
    throw new Error("Nessuna API configurata. Aggiungi RAPIDAPI_KEY o SCRAPINGBEE_API_KEY in .env.local");
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      const data = await fetchCityListings(city, operation, provider, maxPages);
      return { data, provider };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new IdealistaSearchError(`Impossibile recuperare annunci per ${city}`);
}

export function resolvePreferredProvider(preferred?: ListingsProvider): ListingsProvider {
  return preferred ?? getDefaultListingsProvider();
}
