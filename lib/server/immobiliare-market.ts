import type { MarketPriceHistory } from "@/lib/types";
import { fetchMarketHistoryViaScrape, ImmobiliareMarketError } from "./immobiliare-market-scrape";

export { ImmobiliareMarketError };

export async function fetchMarketHistory(city: string): Promise<MarketPriceHistory> {
  const result = await fetchMarketHistoryViaScrape(city);
  return {
    city: result.location.city,
    region: result.location.region,
    region_slug: result.location.region_slug,
    city_slug: result.location.city_slug,
    mercato_url: result.location.mercato_url,
    sale: result.sale,
    rent: result.rent,
    provider: "scrape",
    fetched_at: new Date().toISOString(),
  };
}
