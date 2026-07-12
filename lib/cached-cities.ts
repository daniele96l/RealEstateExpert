import { listingsCacheSlug, MARKETS, type MarketId } from "./markets";

export interface CachedCityOption {
  slug: string;
  label: string;
  query: string;
}

const CZ_CITY_LABELS: Record<string, string> = {
  brno: "Brno",
  prague: "Prague",
  praha: "Praha",
  tabor: "Tábor",
  ostrava: "Ostrava",
  rosice: "Rosice",
};

export function cityLabelFromSlug(slug: string, market: MarketId): string {
  const prefix = `${MARKETS[market].cachePrefix}_`;
  const bare = slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
  return CZ_CITY_LABELS[bare] ?? bare.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function queryFromSlug(slug: string, market: MarketId): string {
  return cityLabelFromSlug(slug, market);
}

export function labelFromDisplayName(displayName: string | null | undefined): string | null {
  if (!displayName?.trim()) return null;
  return displayName.split(",")[0]?.trim() || null;
}

export function listLocalCachedCitySlugs(market: MarketId): string[] {
  if (typeof window === "undefined") return [];
  const prefix = `realestate_listings_${MARKETS[market].cachePrefix}_`;
  const slugs = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const match = rest.match(/^(.+)_(sale|rent)$/);
    if (match) slugs.add(`${MARKETS[market].cachePrefix}_${match[1]}`);
  }
  return [...slugs];
}

export function mergeCachedCityOptions(
  ...groups: CachedCityOption[][]
): CachedCityOption[] {
  const bySlug = new Map<string, CachedCityOption>();
  for (const group of groups) {
    for (const option of group) {
      const existing = bySlug.get(option.slug);
      if (!existing || option.label.length > existing.label.length) {
        bySlug.set(option.slug, option);
      }
    }
  }
  return [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label, "cs"));
}

export function slugToQuery(slug: string, market: MarketId, label: string): string {
  return queryFromSlug(slug, market);
}

export function isDuplicateCacheSlug(slug: string, market: MarketId): boolean {
  const prefix = `${MARKETS[market].cachePrefix}_`;
  const bare = slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
  return bare.startsWith(`${MARKETS[market].cachePrefix}_`);
}

export function listingsCacheSlugForQuery(market: MarketId, query: string): string {
  return listingsCacheSlug(market, query);
}
