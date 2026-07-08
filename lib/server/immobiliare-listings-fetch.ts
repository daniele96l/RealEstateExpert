import type { CityListingsCache, ListingsProvider } from "@/lib/types";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { hasRealtyApiKey, isRapidApiEnabled } from "./config";
import { shouldSkipRapidApi } from "./provider-quota";
import { ImmobiliareBrowserError } from "./immobiliare-browser";
import { fetchImmobiliareCityListings, ImmobiliareSearchError } from "./immobiliare-search";
import {
  fetchCityListingsViaRapidApi,
  RapidApiImmobiliareError,
} from "./rapidapi-immobiliare";
import {
  fetchCityListingsViaRealtyApi,
  RealtyApiImmobiliareError,
} from "./realtyapi-immobiliare";

export {
  ImmobiliareBrowserError,
  ImmobiliareSearchError,
  RapidApiImmobiliareError,
  RealtyApiImmobiliareError,
};

const IMMOBILIARE_PROVIDERS: ListingsProvider[] = ["realtyapi", "rapidapi", "direct"];

function isImmobiliareProviderConfigured(provider: ListingsProvider): boolean {
  if (provider === "rapidapi") return isRapidApiEnabled() && !shouldSkipRapidApi();
  if (provider === "realtyapi") return hasRealtyApiKey();
  if (provider === "direct") return true;
  return false;
}

function immobiliareProviderOrder(preferred: ListingsProvider): ListingsProvider[] {
  const preferredProvider = IMMOBILIARE_PROVIDERS.includes(preferred) ? preferred : "realtyapi";
  return [preferredProvider, ...IMMOBILIARE_PROVIDERS.filter((p) => p !== preferredProvider)];
}

function normalizeImmobiliareFetchError(err: unknown): unknown {
  if (err instanceof ImmobiliareBrowserError) {
    return new ImmobiliareSearchError(err.message);
  }
  return err;
}

export function buildImmobiliareSearchQuery(city: string, zone?: string | null): string {
  const trimmedCity = city.trim();
  const trimmedZone = zone?.trim();
  if (trimmedZone) return `${trimmedZone}, ${trimmedCity}`;
  return trimmedCity;
}

async function fetchViaProvider(
  provider: ListingsProvider,
  city: string,
  operation: "sale" | "rent",
  maxPages: number,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  if (provider === "realtyapi") {
    return fetchCityListingsViaRealtyApi(city, operation, maxPages, onPage);
  }
  if (provider === "rapidapi") {
    return fetchCityListingsViaRapidApi(city, operation, maxPages, onPage);
  }
  return fetchImmobiliareCityListings(city, operation, { maxPages, onPage });
}

export async function fetchImmobiliareWithFallback(
  city: string,
  operation: "sale" | "rent",
  preferred: ListingsProvider,
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
): Promise<{ data: CityListingsCache; provider: ListingsProvider }> {
  const order = immobiliareProviderOrder(preferred).filter(isImmobiliareProviderConfigured);
  if (!order.length) {
    throw new Error(
      "Nessuna API configurata. Aggiungi REALTYAPI_KEY o RAPIDAPI_KEY in .env.local",
    );
  }

  let lastError: unknown;
  for (const provider of order) {
    try {
      const data = await fetchViaProvider(provider, city, operation, maxPages, onPage);
      return { data: { ...data, provider }, provider };
    } catch (err) {
      lastError = normalizeImmobiliareFetchError(err);
    }
  }

  throw lastError ?? new ImmobiliareSearchError(`Impossibile recuperare annunci Immobiliare per ${city}`);
}
