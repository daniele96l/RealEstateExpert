import { listingsCacheSlug, type MarketId } from "./markets";

/** Underscore slug used for data/market/*.json and browser cache keys. */
export function marketCitySlug(city: string): string {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Alternate slugs for the same city (e.g. Reggio Calabria vs Reggio di Calabria). */
const SLUG_ALIASES: Record<string, string[]> = {
  reggio_calabria: ["reggio_di_calabria"],
  reggio_di_calabria: ["reggio_calabria"],
};

/** File slug candidates for market history JSON / localStorage (most specific first). */
export function marketCacheFileSlugs(city: string, market: MarketId = "it"): string[] {
  const primary = market === "cz" ? listingsCacheSlug(market, city) : marketCitySlug(city);
  const slugs = new Set<string>();
  if (primary) slugs.add(primary);

  for (const alias of SLUG_ALIASES[primary] ?? []) {
    slugs.add(alias);
  }

  const diVariant = primary.replace(/_di_/g, "_");
  if (diVariant !== primary) slugs.add(diVariant);

  return [...slugs];
}
