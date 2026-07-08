export type ListingsProvider = "scrapingbee" | "rapidapi" | "realtyapi" | "direct";
export type MarketProvider = "scrapingbee" | "insights";
export type MarketProviderMode = MarketProvider | "auto";

export function getRapidApiKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY non configurata in .env.local");
  return key;
}

export function getScrapingBeeKey(): string {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) throw new Error("SCRAPINGBEE_API_KEY non configurata in .env.local");
  return key;
}

export function hasRapidApiKey(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY?.trim());
}

export function isRapidApiEnabled(): boolean {
  return hasRapidApiKey() && process.env.RAPIDAPI_DISABLED !== "1";
}

export function hasScrapingBeeKey(): boolean {
  return Boolean(process.env.SCRAPINGBEE_API_KEY?.trim());
}

export function getRealtyApiKey(): string {
  const key = process.env.REALTYAPI_KEY;
  if (!key) throw new Error("REALTYAPI_KEY non configurata in .env.local");
  return key;
}

export function hasRealtyApiKey(): boolean {
  return Boolean(process.env.REALTYAPI_KEY?.trim());
}

export function getDefaultListingsProvider(): ListingsProvider {
  const env = process.env.LISTINGS_PROVIDER?.toLowerCase();
  if (env === "rapidapi" || env === "scrapingbee" || env === "realtyapi" || env === "direct") {
    return env;
  }
  if (hasRealtyApiKey()) return "realtyapi";
  if (hasScrapingBeeKey()) return "scrapingbee";
  if (isRapidApiEnabled()) return "rapidapi";
  return "direct";
}

export function hasImmobiliareInsightsCredentials(): boolean {
  return Boolean(
    process.env.IMMOBILIARE_INSIGHTS_CLIENT_ID?.trim() &&
      process.env.IMMOBILIARE_INSIGHTS_CLIENT_SECRET?.trim() &&
      process.env.IMMOBILIARE_INSIGHTS_USERNAME?.trim() &&
      process.env.IMMOBILIARE_INSIGHTS_PASSWORD?.trim(),
  );
}

export function getImmobiliareInsightsBaseUrl(): string {
  return process.env.IMMOBILIARE_INSIGHTS_BASE_URL?.trim() || "https://ws-osservatorio.realitycs.it";
}

export function getDefaultMarketProvider(): MarketProviderMode {
  const env = process.env.MARKET_PROVIDER?.toLowerCase();
  if (env === "scrapingbee" || env === "insights" || env === "auto") return env;
  return "auto";
}
