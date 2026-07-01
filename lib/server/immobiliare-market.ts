import type { MarketPriceHistory, MarketProvider } from "@/lib/types";
import {
  getDefaultMarketProvider,
  hasImmobiliareInsightsCredentials,
  hasScrapingBeeKey,
  type MarketProviderMode,
} from "./config";
import { fetchMarketHistoryViaInsights, ImmobiliareInsightsError } from "./immobiliare-insights";
import {
  fetchMarketHistoryViaScrape,
  ImmobiliareMarketError,
  ScrapingBeeError,
} from "./immobiliare-market-scrape";

export { ImmobiliareInsightsError, ImmobiliareMarketError, ScrapingBeeError };

function providerOrder(preferred: MarketProviderMode): MarketProvider[] {
  if (preferred === "insights") return ["insights"];
  if (preferred === "scrapingbee") return ["scrapingbee"];
  const order: MarketProvider[] = [];
  if (hasImmobiliareInsightsCredentials()) order.push("insights");
  if (hasScrapingBeeKey()) order.push("scrapingbee");
  return order;
}

export async function fetchMarketHistory(
  city: string,
  preferred: MarketProviderMode = getDefaultMarketProvider(),
): Promise<MarketPriceHistory> {
  const available = providerOrder(preferred);
  if (!available.length) {
    throw new Error(
      "Nessun provider mercato configurato. Aggiungi SCRAPINGBEE_API_KEY o credenziali Immobiliare Insights in .env.local",
    );
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      const result =
        provider === "insights"
          ? await fetchMarketHistoryViaInsights(city)
          : await fetchMarketHistoryViaScrape(city);

      return {
        city: result.location.city,
        region: result.location.region,
        region_slug: result.location.region_slug,
        city_slug: result.location.city_slug,
        mercato_url: result.location.mercato_url,
        sale: result.sale,
        rent: result.rent,
        provider,
        fetched_at: new Date().toISOString(),
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new ImmobiliareMarketError(`Impossibile recuperare dati mercato per ${city}`);
}
