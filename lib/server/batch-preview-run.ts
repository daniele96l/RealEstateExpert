import type { ListingSource } from "@/lib/listing-url";
import { resolveBatchFetchPageLimit } from "@/lib/batch-fetch-pages";
import {
  batchFetchProgressLabel,
  type BatchFetchStreamProgressEvent,
} from "@/lib/batch-fetch-progress";
import type { MarketId } from "@/lib/markets";
import { geocodeCity } from "@/lib/server/geocode";
import {
  buildImmobiliareSearchQuery,
  fetchImmobiliareWithFallback,
} from "@/lib/server/immobiliare-listings-fetch";
import { getCache, mergeListingCache, replaceListingCache, saveCache } from "@/lib/server/listings-cache";
import {
  buildSearchQuery,
  fetchWithFallback,
  resolvePreferredProvider,
} from "@/lib/server/listings-fetch";
import { fetchSrealityCityListings } from "@/lib/server/sreality-search";
import type { BatchPreviewResult, ListingsProvider } from "@/lib/types";

export interface BatchPreviewRequest {
  city: string;
  zone?: string;
  operations: ("sale" | "rent")[];
  refresh?: boolean;
  provider?: ListingsProvider;
  portal?: ListingSource;
  maxPages?: number;
  market: MarketId;
}

export async function runBatchPreview(
  body: BatchPreviewRequest,
  onProgress?: (event: BatchFetchStreamProgressEvent) => void,
): Promise<BatchPreviewResult> {
  const market = body.market;
  const operations = body.operations;
  const maxPages = resolveBatchFetchPageLimit(body.maxPages, market);
  const totalSteps = operations.length * maxPages;
  let step = 0;

  const emitPageProgress = (operation: "sale" | "rent", page: number, listingsTotal: number) => {
    step += 1;
    onProgress?.({
      type: "progress",
      current: step,
      total: totalSteps,
      operation,
      page,
      maxPages,
      listingsTotal,
      label: batchFetchProgressLabel(operation, page, maxPages, market),
    });
  };

  if (market === "cz") {
    if (!body.refresh) {
      const cachedParts = await Promise.all(
        operations.map(async (operation) => {
          const cached = await getCache(market, body.city, operation);
          return cached ? { operation, cached } : null;
        }),
      );
      const hits = cachedParts.filter((p): p is NonNullable<typeof p> => p != null);
      if (hits.length === operations.length) {
        const center = hits[0]!.cached.center;
        const result: BatchPreviewResult = {
          city: hits[0]!.cached.city,
          center,
          provider: "sreality",
          fetched_at: hits[0]!.cached.fetched_at,
        };
        for (const { operation, cached } of hits) {
          if (operation === "sale") result.sale = cached;
          else result.rent = cached;
        }
        return result;
      }
    }

    const results: Array<{
      operation: "sale" | "rent";
      data: Awaited<ReturnType<typeof fetchSrealityCityListings>> & { provider: "sreality" };
      provider: "sreality";
    }> = [];

    for (const operation of operations) {
      const data = await fetchSrealityCityListings(body.city, operation, market, {
        maxPages,
        onPage: (p) => emitPageProgress(p.operation, p.page, p.listingsTotal),
      });
      results.push({
        operation,
        data: { ...data, provider: "sreality" as const },
        provider: "sreality" as const,
      });
    }

    const centerData = await geocodeCity(body.city.trim(), market);
    const allListings = results.flatMap((r) => r.data.listings);
    const avgLat =
      allListings.length > 0
        ? allListings.reduce((s, l) => s + l.lat, 0) / allListings.length
        : centerData.lat;
    const avgLng =
      allListings.length > 0
        ? allListings.reduce((s, l) => s + l.lng, 0) / allListings.length
        : centerData.lng;

    const result: BatchPreviewResult = {
      city: results[0]?.data.city ?? body.city.trim(),
      center: {
        lat: centerData.lat || avgLat,
        lng: centerData.lng || avgLng,
        display_name: centerData.display_name ?? null,
      },
      provider: "sreality",
      fetched_at: new Date().toISOString(),
    };

    for (const { operation, data } of results) {
      const existing = await getCache(market, body.city, operation);
      const merged = body.refresh
        ? replaceListingCache(existing, data)
        : mergeListingCache(existing, data);
      await saveCache(merged, market);
      if (operation === "sale") result.sale = merged;
      else result.rent = merged;
    }

    return result;
  }

  const portal: ListingSource = body.portal === "immobiliare" ? "immobiliare" : "idealista";
  const searchQuery =
    portal === "immobiliare"
      ? buildImmobiliareSearchQuery(body.city, body.zone)
      : buildSearchQuery(body.city, body.zone);
  const preferred = resolvePreferredProvider(body.provider);

  if (!body.refresh) {
    const cachedParts = await Promise.all(
      operations.map(async (operation) => {
        const cached = await getCache(market, searchQuery, operation);
        return cached ? { operation, cached } : null;
      }),
    );
    const hits = cachedParts.filter((p): p is NonNullable<typeof p> => p != null);
    if (hits.length === operations.length) {
      const center = hits[0]!.cached.center;
      const provider = hits[0]!.cached.provider ?? preferred;
      const result: BatchPreviewResult = {
        city: hits[0]!.cached.city,
        center,
        provider,
        fetched_at: hits[0]!.cached.fetched_at,
      };
      for (const { operation, cached } of hits) {
        if (operation === "sale") result.sale = cached;
        else result.rent = cached;
      }
      return result;
    }
  }

  const results: Array<{
    operation: "sale" | "rent";
    data: { provider: ListingsProvider; city: string; operation: "sale" | "rent"; fetched_at: string; center: import("@/lib/types").MapCenter; listings: import("@/lib/types").MapListing[] };
    provider: ListingsProvider;
  }> = [];

  for (const operation of operations) {
    const { data, provider } =
      portal === "immobiliare"
        ? await fetchImmobiliareWithFallback(
            searchQuery,
            operation,
            preferred,
            maxPages,
            (p) => emitPageProgress(p.operation, p.page, p.listingsTotal),
          )
        : await fetchWithFallback(
            searchQuery,
            operation,
            preferred,
            maxPages,
            (p) => emitPageProgress(p.operation, p.page, p.listingsTotal),
          );
    results.push({ operation, data: { ...data, provider }, provider });
  }

  const centerData = await geocodeCity(body.city.trim(), market);
  const allListings = results.flatMap((r) => r.data.listings);
  const avgLat =
    allListings.length > 0
      ? allListings.reduce((s, l) => s + l.lat, 0) / allListings.length
      : centerData.lat;
  const avgLng =
    allListings.length > 0
      ? allListings.reduce((s, l) => s + l.lng, 0) / allListings.length
      : centerData.lng;

  const result: BatchPreviewResult = {
    city: results[0]?.data.city ?? body.city.trim(),
    center: {
      lat: centerData.lat || avgLat,
      lng: centerData.lng || avgLng,
      display_name: centerData.display_name ?? null,
    },
    provider: results[0]?.provider ?? preferred,
    fetched_at: new Date().toISOString(),
  };

  for (const { operation, data } of results) {
    const existing = await getCache(market, data.city, operation);
    const merged = body.refresh
      ? replaceListingCache(existing, data)
      : mergeListingCache(existing, data);
    await saveCache(merged, market);
    if (operation === "sale") result.sale = merged;
    else result.rent = merged;
  }

  return result;
}
