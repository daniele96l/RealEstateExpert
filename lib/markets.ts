export type MarketId = "it" | "cz";

export interface MarketConfig {
  id: MarketId;
  label: string;
  subtitle: string;
  defaultCity: string;
  currency: "EUR" | "CZK";
  locale: string;
  geocodeCountry: string;
  geocodeCountryCodes: string;
  cachePrefix: string;
  srealityRegionId?: number;
}

export const MARKETS: Record<MarketId, MarketConfig> = {
  it: {
    id: "it",
    label: "Italia",
    subtitle: "Simulatore investimento immobiliare — Italia",
    defaultCity: "Reggio Calabria",
    currency: "EUR",
    locale: "it-IT",
    geocodeCountry: "Italy",
    geocodeCountryCodes: "it",
    cachePrefix: "it",
  },
  cz: {
    id: "cz",
    label: "Česko",
    subtitle: "Simulátor investic do nemovitostí — Brno",
    defaultCity: "Brno",
    currency: "CZK",
    locale: "cs-CZ",
    geocodeCountry: "Czechia",
    geocodeCountryCodes: "cz",
    cachePrefix: "cz",
    srealityRegionId: 14,
  },
};

export const MARKET_STORAGE_KEY = "realestate_market";

export function getMarket(id: MarketId): MarketConfig {
  return MARKETS[id];
}

export function isMarketId(value: string | null | undefined): value is MarketId {
  return value === "it" || value === "cz";
}

export function readStoredMarket(): MarketId {
  if (typeof window === "undefined") return "it";
  try {
    const raw = localStorage.getItem(MARKET_STORAGE_KEY);
    return isMarketId(raw) ? raw : "it";
  } catch {
    return "it";
  }
}

export function writeStoredMarket(market: MarketId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MARKET_STORAGE_KEY, market);
  } catch {
    /* ignore */
  }
}

export function listingsCacheSlug(market: MarketId, city: string): string {
  const citySlug = city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${MARKETS[market].cachePrefix}_${citySlug || "import"}`;
}
