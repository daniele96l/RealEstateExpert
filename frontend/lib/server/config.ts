export type ListingsProvider = "scrapingbee" | "rapidapi";

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

export function hasScrapingBeeKey(): boolean {
  return Boolean(process.env.SCRAPINGBEE_API_KEY?.trim());
}

export function getDefaultListingsProvider(): ListingsProvider {
  const env = process.env.LISTINGS_PROVIDER?.toLowerCase();
  if (env === "rapidapi" || env === "scrapingbee") return env;
  if (hasRapidApiKey()) return "rapidapi";
  return "scrapingbee";
}
