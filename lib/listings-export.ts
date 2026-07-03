import { loadPropertyDetailCacheFirst } from "./cache-first";
import { czechRoomLayoutFromListing } from "./czech-room-layout";
import { enrichListingsConditionClient } from "./listing-condition-enrich-client";
import { computeListingProfitPreview, type ListingProfitPreview } from "./listing-profit-preview";
import {
  applyListingProfitFilters,
  type ListingProfitFilters,
} from "./listing-profit-filters";
import type { ListingProfitSettings } from "./listing-profit-settings";
import { filterListings, type ListingsFilters } from "./listings-filters";
import { filterListingsByBounds, type GeoBounds, type GeoPoint } from "./geo-filter";
import { readLocalPropertyDetailCache } from "./property-detail-cache-client";
import { getCachedPropertyDetail, saveListingsExportToServer, savePropertyDetailToServerCache } from "./api";
import type { MarketId } from "./markets";
import type { ListingDetail, ListingsProvider, MapListing } from "./types";
import { writeLocalPropertyDetailCache } from "./property-detail-cache-client";

export interface ListingsExportContext {
  market: MarketId;
  city: string;
  provider: ListingsProvider;
  saleListings: MapListing[];
  rentPool: MapListing[];
  filters: ListingsFilters;
  mapCenterPoint: GeoPoint | null;
  mapBounds: GeoBounds | null;
  profitSettings: ListingProfitSettings;
  profitFilters: ListingProfitFilters;
  hasData: boolean;
}

export interface ListingsExportOptions {
  useMapFilters: boolean;
  filters: ListingsFilters;
  applyMapBounds: boolean;
  includeProfitPreview: boolean;
  fetchMissingDetails: boolean;
}

export type ListingDetailLevel = "map_only" | "cached" | "fetched";

export interface ListingExportRecord extends MapListing {
  detail_level: ListingDetailLevel;
  price_per_sqm_computed: number | null;
  czech_room_layout: string | null;
  description: string | null;
  bathrooms: number | null;
  floor: string | null;
  energy_class: ListingDetail["energy_class"];
  energy_kwh_sqm: number | null;
  zone: string | null;
  city_label: string | null;
  price_per_sqm: number | null;
  condominio_monthly: number | null;
  lift: boolean | null;
  garden: boolean | null;
  terrace: boolean | null;
  garage: boolean | null;
  furnished: string | null;
  built_year: number | null;
  images: string[];
  detail_fetched_at: string | null;
  profit_preview: ListingProfitPreview | null;
}

export interface ListingsExportBundle {
  exported_at: string;
  market: MarketId;
  city: string;
  provider: ListingsProvider;
  filters_applied: ListingsFilters;
  include_profit_preview: boolean;
  count: number;
  listings: ListingExportRecord[];
  fetch_stats: {
    cached: number;
    fetched: number;
    map_only: number;
    fetch_errors: number;
  };
}

export interface ExportProgress {
  phase: "filtering" | "details" | "building";
  current: number;
  total: number;
  message?: string;
}


function pricePerSqmComputed(listing: MapListing): number | null {
  if (listing.sqm != null && listing.sqm > 0) {
    return Math.round(listing.price / listing.sqm);
  }
  return null;
}

export function resolveExportSaleListings(
  ctx: ListingsExportContext,
  options: Pick<ListingsExportOptions, "useMapFilters" | "filters" | "applyMapBounds" | "includeProfitPreview">,
): MapListing[] {
  const filters = options.useMapFilters ? ctx.filters : options.filters;
  let result = filterListings(ctx.saleListings, filters, ctx.mapCenterPoint);

  if (options.includeProfitPreview && ctx.rentPool.length > 0) {
    const previews = new Map<string, ListingProfitPreview>();
    for (const listing of result) {
      const preview = computeListingProfitPreview(
        listing,
        ctx.rentPool,
        ctx.profitSettings,
        ctx.market,
      );
      if (preview) previews.set(listing.id, preview);
    }
    result = applyListingProfitFilters(result, previews, ctx.profitFilters);
  }

  if (options.useMapFilters && options.applyMapBounds && ctx.mapBounds) {
    result = filterListingsByBounds(result, ctx.mapBounds);
  }

  return result.filter((l) => l.operation === "sale");
}

async function persistDetailLocally(detail: ListingDetail): Promise<void> {
  writeLocalPropertyDetailCache(detail);
  try {
    await savePropertyDetailToServerCache(detail);
  } catch {
    /* read-only host or offline — browser cache still updated */
  }
}

async function readCachedDetail(id: string): Promise<ListingDetail | null> {
  const local = readLocalPropertyDetailCache(id);
  if (local) return local;
  try {
    const server = await getCachedPropertyDetail(id);
    if (server) {
      writeLocalPropertyDetailCache(server);
      return server;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function mapOnlyRecord(listing: MapListing, market: MarketId, profit: ListingProfitPreview | null): ListingExportRecord {
  return {
    ...listing,
    detail_level: "map_only",
    price_per_sqm_computed: pricePerSqmComputed(listing),
    czech_room_layout: market === "cz" ? czechRoomLayoutFromListing(listing) : null,
    description: null,
    bathrooms: null,
    floor: null,
    energy_class: null,
    energy_kwh_sqm: null,
    zone: null,
    city_label: null,
    price_per_sqm: null,
    condominio_monthly: null,
    lift: null,
    garden: null,
    terrace: null,
    garage: null,
    furnished: null,
    built_year: null,
    images: [],
    detail_fetched_at: null,
    profit_preview: profit,
  };
}

function detailRecord(
  listing: MapListing,
  detail: ListingDetail,
  level: ListingDetailLevel,
  market: MarketId,
  profit: ListingProfitPreview | null,
): ListingExportRecord {
  return {
    ...listing,
    ...detail,
    detail_level: level,
    price_per_sqm_computed:
      detail.price_per_sqm ?? pricePerSqmComputed(listing),
    czech_room_layout: market === "cz" ? czechRoomLayoutFromListing(listing) : null,
    detail_fetched_at: detail.fetched_at ?? null,
    profit_preview: profit,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let nextIndex = 0;
  let done = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await fn(item);
      done++;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

export async function buildListingsExport(
  ctx: ListingsExportContext,
  options: ListingsExportOptions,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ListingsExportBundle> {
  onProgress?.({ phase: "filtering", current: 0, total: 1 });

  const filtered = resolveExportSaleListings(ctx, options);
  const filtersApplied = options.useMapFilters ? ctx.filters : options.filters;

  const profitById = new Map<string, ListingProfitPreview>();
  if (options.includeProfitPreview && ctx.rentPool.length > 0) {
    for (const listing of filtered) {
      const preview = computeListingProfitPreview(
        listing,
        ctx.rentPool,
        ctx.profitSettings,
        ctx.market,
      );
      if (preview) profitById.set(listing.id, preview);
    }
  }

  const stats = { cached: 0, fetched: 0, map_only: 0, fetch_errors: 0 };
  const records: ListingExportRecord[] = [];
  const pendingFetch: MapListing[] = [];

  for (const listing of filtered) {
    const profit = profitById.get(listing.id) ?? null;
    const cached = await readCachedDetail(listing.id);
    if (cached) {
      stats.cached++;
      await persistDetailLocally(cached);
      records.push(detailRecord(listing, cached, "cached", ctx.market, profit));
    } else if (options.fetchMissingDetails) {
      pendingFetch.push(listing);
    } else {
      stats.map_only++;
      records.push(mapOnlyRecord(listing, ctx.market, profit));
    }
  }

  onProgress?.({ phase: "details", current: records.length, total: filtered.length });

  if (pendingFetch.length > 0) {
    let detailDone = records.length;
    await runWithConcurrency(
      pendingFetch,
      4,
      async (listing) => {
        const profit = profitById.get(listing.id) ?? null;
        try {
          const { detail, source } = await loadPropertyDetailCacheFirst(
            listing,
            ctx.provider,
            false,
          );
          await persistDetailLocally(detail);
          if (source === "network") stats.fetched++;
          else stats.cached++;
          records.push(
            detailRecord(
              listing,
              detail,
              source === "network" ? "fetched" : "cached",
              ctx.market,
              profit,
            ),
          );
        } catch {
          stats.fetch_errors++;
          stats.map_only++;
          records.push(mapOnlyRecord(listing, ctx.market, profit));
        }
        detailDone++;
        onProgress?.({
          phase: "details",
          current: detailDone,
          total: filtered.length,
          message: `${detailDone}/${filtered.length}`,
        });
      },
    );
  }

  records.sort((a, b) => a.price - b.price);

  onProgress?.({ phase: "building", current: 1, total: 1 });

  return {
    exported_at: new Date().toISOString(),
    market: ctx.market,
    city: ctx.city,
    provider: ctx.provider,
    filters_applied: filtersApplied,
    include_profit_preview: options.includeProfitPreview,
    count: records.length,
    listings: records,
    fetch_stats: stats,
  };
}

export async function persistListingsExport(bundle: ListingsExportBundle): Promise<{
  download: true;
  savedPath: string | null;
}> {
  downloadListingsExport(bundle);
  try {
    const { path } = await saveListingsExportToServer(bundle);
    return { download: true, savedPath: path };
  } catch {
    return { download: true, savedPath: null };
  }
}

export function downloadListingsExport(bundle: ListingsExportBundle): void {
  const slug = bundle.city.replace(/\s+/g, "_").toLowerCase();
  const date = bundle.exported_at.slice(0, 10);
  const filename = `listings_${bundle.market}_${slug}_sale_${date}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function enrichSaleListingsForExport(listings: MapListing[]): MapListing[] {
  return enrichListingsConditionClient(listings.filter((l) => l.operation === "sale"));
}
