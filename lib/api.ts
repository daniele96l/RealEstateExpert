import type {
  BatchPreviewResult,
  BatchSaveResult,
  CityListingsCache,
  ListingDetail,
  ListingsProvider,
  MapListing,
  MapCenter,
  MarketPriceHistory,
  OccupancyCityMetrics,
  OccupancyDashboardData,
  OccupancyRemovalEvent,
  VerifyListingDatesResult,
} from "./types";
import type { ListingsExportBundle } from "./listings-export";
import type { BatchFetchProgressState, BatchFetchStreamEvent } from "./batch-fetch-progress";

import type { MarketId } from "./markets";
import type { CachedCityOption } from "./cached-cities";
import type { OccupancyPortal } from "./occupancy/portals";
import type {
  OccupancySnapshotProgressState,
  OccupancySnapshotStreamEvent,
} from "./occupancy-snapshot-progress";

async function parseError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { detail?: string; error?: string };
    if (body.detail) return body.detail;
    if (body.error) return body.error;
  } catch {
    if (text) return text;
  }
  return fallback;
}

export async function importFromIdealista(url: string, _provider?: ListingsProvider, refresh = false): Promise<CityListingsCache> {
  const res = await fetch("/api/import/idealista", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, refresh }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Importazione non riuscita"));
  return res.json();
}

export async function fetchListings(
  city: string,
  operation: "sale" | "rent",
  refresh = false,
  portal: "idealista" | "immobiliare" = "idealista",
  market: MarketId = "it",
  maxPages?: number,
): Promise<CityListingsCache> {
  const res = await fetch("/api/listings/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, operation, refresh, portal, market, maxPages }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Caricamento annunci non riuscito"));
  return res.json();
}


export async function getCachedPropertyDetail(id: string): Promise<ListingDetail | null> {
  const params = new URLSearchParams({ id });
  const res = await fetch(`/api/listings/property?${params}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res, "Errore lettura cache dettaglio"));
  return res.json();
}

export async function fetchPropertyDetail(
  listing: MapListing,
  refresh = false,
): Promise<ListingDetail> {
  const res = await fetch("/api/listings/property", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: listing.url, listing, refresh }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Dettaglio annuncio non disponibile"));
  return res.json();
}

export async function getCachedListings(
  city: string,
  operation: "sale" | "rent",
  market: MarketId = "it",
): Promise<CityListingsCache | null> {
  const params = new URLSearchParams({ city, operation, market });
  const res = await fetch(`/api/listings/fetch?${params}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res, "Errore lettura cache"));
  return res.json();
}

export async function listCachedCities(market: MarketId = "it"): Promise<CachedCityOption[]> {
  const params = new URLSearchParams({ market });
  const res = await fetch(`/api/listings/cities?${params}`);
  if (!res.ok) throw new Error(await parseError(res, "Errore lettura città"));
  const body = (await res.json()) as { cities?: CachedCityOption[] };
  return body.cities ?? [];
}

export async function fetchMarketHistory(
  city: string,
  refresh = false,
  market: "it" | "cz" = "it",
): Promise<MarketPriceHistory> {
  const res = await fetch("/api/market/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, refresh, market }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Caricamento dati mercato non riuscito"));
  return res.json();
}

export async function getCachedMarketHistory(
  city: string,
  market: "it" | "cz" = "it",
): Promise<MarketPriceHistory | null> {
  const params = new URLSearchParams({ city, market });
  const res = await fetch(`/api/market/history?${params}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res, "Errore lettura cache mercato"));
  return res.json();
}

export async function batchPreviewListings(
  city: string,
  operations: ("sale" | "rent")[],
  opts?: {
    zone?: string;
    refresh?: boolean;
    portal?: "idealista" | "immobiliare" | "sreality";
    maxPages?: number;
    market?: MarketId;
  },
): Promise<BatchPreviewResult> {
  const res = await fetch("/api/listings/batch-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city,
      zone: opts?.zone,
      operations,
      refresh: opts?.refresh ?? true,
      portal: opts?.portal,
      maxPages: opts?.maxPages,
      market: opts?.market ?? "it",
    }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Anteprima batch non riuscita"));
  return res.json();
}

export async function batchPreviewListingsStream(
  city: string,
  operations: ("sale" | "rent")[],
  opts: {
    zone?: string;
    refresh?: boolean;
    portal?: "idealista" | "immobiliare" | "sreality";
    maxPages?: number;
    market?: MarketId;
    onProgress?: (progress: BatchFetchProgressState) => void;
  },
): Promise<BatchPreviewResult> {
  const res = await fetch("/api/listings/batch-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city,
      zone: opts.zone,
      operations,
      refresh: opts.refresh ?? true,
      portal: opts.portal,
      maxPages: opts.maxPages,
      market: opts.market ?? "it",
      stream: true,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res, "Anteprima batch non riuscita"));
  if (!res.body) throw new Error("Risposta streaming non disponibile");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: BatchPreviewResult | null = null;
  let lastTotal = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as BatchFetchStreamEvent;
      if (event.type === "progress") {
        lastTotal = event.total;
        opts.onProgress?.({
          current: event.current,
          total: event.total,
          operation: event.operation,
          page: event.page,
          maxPages: event.maxPages,
          listingsTotal: event.listingsTotal,
          label: event.label,
        });
      } else if (event.type === "done") {
        result = event.result;
        if (lastTotal > 0) {
          opts.onProgress?.({
            current: lastTotal,
            total: lastTotal,
            operation: null,
            page: 0,
            maxPages: 0,
            listingsTotal:
              (event.result.sale?.listings.length ?? 0) + (event.result.rent?.listings.length ?? 0),
            label: "",
          });
        }
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  }

  if (!result) throw new Error("Anteprima batch incompleta");
  return result;
}

export async function batchSaveListings(payload: {
  city: string;
  center: MapCenter;
  provider?: ListingsProvider;
  sale?: MapListing[];
  rent?: MapListing[];
  market?: MarketId;
}): Promise<BatchSaveResult> {
  const res = await fetch("/api/listings/batch-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Salvataggio batch non riuscito"));
  return res.json();
}

export async function geocodeCityQuery(
  city: string,
  zone?: string,
  market: MarketId = "it",
): Promise<MapCenter> {
  const params = new URLSearchParams({ city, market });
  if (zone?.trim()) params.set("zone", zone.trim());
  const res = await fetch(`/api/geocode?${params}`);
  if (!res.ok) throw new Error(await parseError(res, "Geocoding non riuscito"));
  return res.json();
}

export async function savePropertyDetailToServerCache(
  detail: ListingDetail,
): Promise<{ path: string }> {
  const res = await fetch("/api/listings/property", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ detail }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Salvataggio dettaglio non riuscito"));
  const body = (await res.json()) as { path: string };
  return { path: body.path };
}

export async function saveListingsExportToServer(
  bundle: ListingsExportBundle,
): Promise<{ path: string; read_only_host?: boolean }> {
  const res = await fetch("/api/listings/export-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
  if (!res.ok) throw new Error(await parseError(res, "Salvataggio export non riuscito"));
  return res.json();
}

export async function fetchOccupancyMetrics(
  asOf?: string | null,
  portal?: OccupancyPortal | null,
  city?: string | null,
  period?: string | null,
  basis?: string | null,
): Promise<OccupancyDashboardData> {
  const params = new URLSearchParams();
  if (asOf) params.set("asOf", asOf);
  if (portal) params.set("portal", portal);
  if (city) params.set("city", city);
  if (period) params.set("period", period);
  if (basis) params.set("basis", basis);
  const query = params.toString();
  const res = await fetch(`/api/occupancy/metrics${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error(await parseError(res, "Lettura metriche occupancy non riuscita"));
  return res.json();
}

export async function fetchOccupancySnapshotDetail(
  fetchedAt: string,
  opts?: { city?: string | null; portal?: OccupancyPortal | null },
): Promise<{
  snapshot: import("./types").OccupancySnapshot;
  meta: import("./types").OccupancySnapshotMetaEntry;
}> {
  const params = new URLSearchParams({ fetched_at: fetchedAt });
  if (opts?.city) params.set("city", opts.city);
  if (opts?.portal) params.set("portal", opts.portal);
  const res = await fetch(`/api/occupancy/snapshot/manage?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Lettura snapshot non riuscita"));
  return res.json();
}

export async function patchOccupancySnapshot(
  body: {
    fetched_at: string;
    city?: string | null;
    portal?: OccupancyPortal | null;
    excluded?: boolean;
    exclude_reason?: string | null;
    remove_listing_ids?: string[];
    edit_note?: string | null;
    asOf?: string | null;
    period?: string | null;
    basis?: string | null;
  },
): Promise<OccupancyDashboardData> {
  const res = await fetch("/api/occupancy/snapshot/manage", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res, "Aggiornamento snapshot non riuscito"));
  return res.json();
}

export async function verifyOccupancyListingDates(
  id: string,
  opts?: {
    city?: string | null;
    portal?: OccupancyPortal | null;
    asOf?: string | null;
  },
): Promise<VerifyListingDatesResult> {
  const params = new URLSearchParams({ id });
  if (opts?.city) params.set("city", opts.city);
  if (opts?.portal) params.set("portal", opts.portal);
  if (opts?.asOf) params.set("asOf", opts.asOf);
  const res = await fetch(`/api/occupancy/verify-listing?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Verifica date annuncio non riuscita"));
  return res.json();
}

export async function refreshOccupancySnapshot(
  portal?: OccupancyPortal,
  opts?: {
    city?: string | null;
    onProgress?: (progress: OccupancySnapshotProgressState) => void;
  },
): Promise<{
  metrics: OccupancyCityMetrics;
  listings_preview: OccupancyDashboardData["listings_preview"];
  fetched_count: number;
  new_count: number;
  rented_count: number;
  snapshot_count: number;
  portal_dates_warning?: string | null;
}> {
  if (opts?.onProgress) {
    return refreshOccupancySnapshotStream(portal, opts.city, opts.onProgress);
  }

  const res = await fetch("/api/occupancy/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(portal ? { portal } : {}),
      ...(opts?.city ? { city: opts.city } : {}),
    }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Aggiornamento occupancy non riuscito"));
  return res.json();
}

export async function refreshOccupancySnapshotStream(
  portal: OccupancyPortal | undefined,
  city: string | null | undefined,
  onProgress: (progress: OccupancySnapshotProgressState) => void,
): Promise<{
  metrics: OccupancyCityMetrics;
  listings_preview: OccupancyDashboardData["listings_preview"];
  fetched_count: number;
  new_count: number;
  rented_count: number;
  snapshot_count: number;
  portal_dates_warning?: string | null;
}> {
  const res = await fetch("/api/occupancy/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(portal ? { portal } : {}),
      ...(city ? { city } : {}),
      stream: true,
    }),
  });

  if (!res.ok) throw new Error(await parseError(res, "Aggiornamento occupancy non riuscito"));
  if (!res.body) throw new Error("Risposta streaming non disponibile");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: {
    metrics: OccupancyCityMetrics;
    listings_preview: OccupancyDashboardData["listings_preview"];
    fetched_count: number;
    new_count: number;
    rented_count: number;
    snapshot_count: number;
    portal_dates_warning?: string | null;
  } | null = null;
  const STREAM_IDLE_MS = 120_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const touchIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void reader.cancel("stream idle timeout");
    }, STREAM_IDLE_MS);
  };

  touchIdleTimer();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as OccupancySnapshotStreamEvent;
        if (event.type === "progress") {
          touchIdleTimer();
          onProgress({
            current: event.current,
            total: event.total,
            page: event.page,
            maxPages: event.maxPages,
            listingsTotal: event.listingsTotal,
            label: event.label,
          });
        } else if (event.type === "done") {
          result = event.result;
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }

  if (!result) throw new Error("Aggiornamento occupancy incompleto");
  return result;
}

export async function fetchOccupancyRemovals(
  portal?: OccupancyPortal | null,
  limit = 50,
  city?: string | null,
): Promise<{ events: OccupancyRemovalEvent[]; portal: OccupancyPortal; city: string }> {
  const params = new URLSearchParams();
  if (portal) params.set("portal", portal);
  if (city) params.set("city", city);
  if (limit !== 50) params.set("limit", String(limit));
  const query = params.toString();
  const res = await fetch(`/api/occupancy/removals${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error(await parseError(res, "Lettura log rimozioni non riuscita"));
  return res.json();
}
