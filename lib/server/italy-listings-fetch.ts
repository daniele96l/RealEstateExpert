import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import type { CityListingsCache, ListingsProvider } from "@/lib/types";
import {
  hasRealtyApiKey,
  hasScrapingBeeKey,
  isRapidApiEnabled,
} from "./config";
import { fetchCityListings, IdealistaSearchError } from "./idealista-search";
import { fetchImmobiliareCityListings, ImmobiliareSearchError } from "./immobiliare-search";
import { fetchCityListingsViaRealtyApi, RealtyApiImmobiliareError } from "./realtyapi-immobiliare";
import { fetchCityListingsViaRapidApi, RapidApiImmobiliareError } from "./rapidapi-immobiliare";
import { RapidApiIdealistaError } from "./rapidapi-idealista";
import { ScrapingBeeError } from "./scrapingbee";
import { noteRapidApiError, shouldSkipRapidApi } from "./provider-quota";

type ItalyProviderAttempt = {
  id: ListingsProvider;
  portal: "immobiliare" | "idealista";
  run: () => Promise<CityListingsCache>;
};

function isConfigured(attempt: ItalyProviderAttempt): boolean {
  if (attempt.id === "realtyapi") return hasRealtyApiKey();
  if (attempt.id === "scrapingbee") return hasScrapingBeeKey();
  if (attempt.id === "rapidapi") return isRapidApiEnabled() && !shouldSkipRapidApi();
  if (attempt.id === "direct") return true;
  return false;
}

function buildAttempts(
  city: string,
  operation: "sale" | "rent",
  maxPages: number,
  onPage?: BatchFetchProgressCallback,
): ItalyProviderAttempt[] {
  return [
    {
      id: "realtyapi",
      portal: "immobiliare",
      run: () => fetchCityListingsViaRealtyApi(city, operation, maxPages, onPage),
    },
    {
      id: "direct",
      portal: "immobiliare",
      run: () => fetchImmobiliareCityListings(city, operation, { maxPages, onPage }),
    },
    {
      id: "rapidapi",
      portal: "immobiliare",
      run: () => fetchCityListingsViaRapidApi(city, operation, maxPages, onPage),
    },
    {
      id: "scrapingbee",
      portal: "idealista",
      run: () => fetchCityListings(city, operation, "scrapingbee", maxPages, onPage),
    },
    {
      id: "direct",
      portal: "idealista",
      run: () => fetchCityListings(city, operation, "direct", maxPages, onPage),
    },
    {
      id: "rapidapi",
      portal: "idealista",
      run: () => fetchCityListings(city, operation, "rapidapi", maxPages, onPage),
    },
  ];
}

function reorderAttempts(
  attempts: ItalyProviderAttempt[],
  preferred: ListingsProvider,
): ItalyProviderAttempt[] {
  const preferredMatches = attempts.filter((a) => a.id === preferred);
  const rest = attempts.filter((a) => a.id !== preferred);
  return [...preferredMatches, ...rest];
}

function normalizeError(err: unknown): unknown {
  if (
    err instanceof RealtyApiImmobiliareError ||
    err instanceof RapidApiImmobiliareError ||
    err instanceof RapidApiIdealistaError ||
    err instanceof ImmobiliareSearchError ||
    err instanceof IdealistaSearchError ||
    err instanceof ScrapingBeeError
  ) {
    return err;
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function fetchItalyListingsWithFallback(
  city: string,
  operation: "sale" | "rent",
  preferred: ListingsProvider,
  maxPages?: number,
  onPage?: BatchFetchProgressCallback,
): Promise<{ data: CityListingsCache; provider: ListingsProvider }> {
  const pageLimit = resolveItalyListingMaxPages(maxPages);
  const ordered = reorderAttempts(buildAttempts(city, operation, pageLimit, onPage), preferred).filter(
    isConfigured,
  );

  if (!ordered.length) {
    throw new Error(
      "Nessun provider configurato. Aggiungi REALTYAPI_KEY, SCRAPINGBEE_API_KEY, o usa il provider diretto (Playwright).",
    );
  }

  let lastError: unknown;
  for (const attempt of ordered) {
    try {
      const data = await attempt.run();
      return { data: { ...data, provider: attempt.id }, provider: attempt.id };
    } catch (err) {
      noteRapidApiError(err);
      lastError = normalizeError(err);
    }
  }

  throw lastError ?? new Error(`Impossibile recuperare annunci per ${city}`);
}
