import {
  fetchListings,
  fetchMarketHistory,
  fetchPropertyDetail,
  getCachedListings,
  getCachedMarketHistory,
  getCachedPropertyDetail,
} from "./api";
import { readLocalListingsCache, writeLocalListingsCache } from "./listings-cache-client";
import { readLocalMarketCache, writeLocalMarketCache } from "./market-cache-client";
import {
  readLocalPropertyDetailCache,
  writeLocalPropertyDetailCache,
} from "./property-detail-cache-client";
import type { CityListingsCache, ListingDetail, ListingsProvider, MapListing, MarketPriceHistory } from "./types";

export type CacheSource = "local" | "server" | "network";

export async function loadCityListingsCacheFirst(
  city: string,
  operation: "sale" | "rent",
  refresh: boolean,
  provider?: ListingsProvider,
): Promise<{ data: CityListingsCache; source: CacheSource }> {
  const trimmed = city.trim();
  if (!refresh) {
    const local = readLocalListingsCache(trimmed, operation);
    if (local) return { data: local, source: "local" };

    const server = await getCachedListings(trimmed, operation);
    if (server) {
      writeLocalListingsCache(server);
      return { data: server, source: "server" };
    }
  }

  const data = await fetchListings(trimmed, operation, refresh, provider);
  writeLocalListingsCache(data);
  return { data, source: "network" };
}

export async function loadPropertyDetailCacheFirst(
  listing: MapListing,
  provider?: ListingsProvider,
  refresh = false,
): Promise<{ detail: ListingDetail; source: CacheSource }> {
  if (!refresh) {
    const local = readLocalPropertyDetailCache(listing.id);
    if (local) return { detail: local, source: "local" };

    const server = await getCachedPropertyDetail(listing.id);
    if (server) {
      writeLocalPropertyDetailCache(server);
      return { detail: server, source: "server" };
    }
  }

  const detail = await fetchPropertyDetail(listing, refresh, provider);
  writeLocalPropertyDetailCache(detail);
  return { detail, source: "network" };
}

export async function loadMarketHistoryCacheFirst(
  city: string,
  refresh: boolean,
): Promise<{ data: MarketPriceHistory; source: CacheSource }> {
  const trimmed = city.trim();
  if (!refresh) {
    const local = readLocalMarketCache(trimmed);
    if (local) return { data: local, source: "local" };

    const server = await getCachedMarketHistory(trimmed);
    if (server) {
      writeLocalMarketCache(server);
      return { data: server, source: "server" };
    }
  }

  const data = await fetchMarketHistory(trimmed, refresh);
  writeLocalMarketCache(data);
  return { data, source: "network" };
}
