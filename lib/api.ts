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
} from "./types";
import type { ListingsExportBundle } from "./listings-export";
import type { BatchFetchProgressState, BatchFetchStreamEvent } from "./batch-fetch-progress";

import type { MarketId } from "./markets";
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

export async function importFromIdealista(
  url: string,
  provider?: ListingsProvider,
  refresh = false,
): Promise<CityListingsCache> {
  const res = await fetch("/api/import/idealista", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, provider, refresh }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Importazione non riuscita"));
  return res.json();
}

export async function fetchListings(
  city: string,
  operation: "sale" | "rent",
  refresh = false,
  provider?: ListingsProvider,
  market: MarketId = "it",
  maxPages?: number,
): Promise<CityListingsCache> {
  const res = await fetch("/api/listings/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, operation, refresh, provider, market, maxPages }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Caricamento annunci non riuscito"));
  return res.json();
}

export async function getListingsProviders(): Promise<{
  default_provider: ListingsProvider;
  scrapingbee: boolean;
  rapidapi: boolean;
  realtyapi: boolean;
}> {
  const res = await fetch("/api/listings/fetch");
  if (!res.ok) throw new Error("Impossibile leggere configurazione provider");
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
  provider?: ListingsProvider,
): Promise<ListingDetail> {
  const res = await fetch("/api/listings/property", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: listing.url, listing, refresh, provider }),
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
    provider?: ListingsProvider;
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
      provider: opts?.provider,
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
    provider?: ListingsProvider;
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
      provider: opts.provider,
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
): Promise<OccupancyDashboardData> {
  const params = new URLSearchParams();
  if (asOf) params.set("asOf", asOf);
  if (portal) params.set("portal", portal);
  const query = params.toString();
  const res = await fetch(`/api/occupancy/metrics${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error(await parseError(res, "Lettura metriche occupancy non riuscita"));
  return res.json();
}

export async function refreshOccupancySnapshot(
  portal?: OccupancyPortal,
  opts?: { onProgress?: (progress: OccupancySnapshotProgressState) => void },
): Promise<{
  metrics: OccupancyCityMetrics;
  listings_preview: OccupancyDashboardData["listings_preview"];
  fetched_count: number;
  new_count: number;
  rented_count: number;
  snapshot_count: number;
}> {
  if (opts?.onProgress) {
    return refreshOccupancySnapshotStream(portal, opts.onProgress);
  }

  const res = await fetch("/api/occupancy/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(portal ? { portal } : {}),
  });
  if (!res.ok) throw new Error(await parseError(res, "Aggiornamento occupancy non riuscito"));
  return res.json();
}

export async function refreshOccupancySnapshotStream(
  portal: OccupancyPortal | undefined,
  onProgress: (progress: OccupancySnapshotProgressState) => void,
): Promise<{
  metrics: OccupancyCityMetrics;
  listings_preview: OccupancyDashboardData["listings_preview"];
  fetched_count: number;
  new_count: number;
  rented_count: number;
  snapshot_count: number;
}> {
  const res = await fetch("/api/occupancy/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(portal ? { portal } : {}),
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
  } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as OccupancySnapshotStreamEvent;
      if (event.type === "progress") {
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

  if (!result) throw new Error("Aggiornamento occupancy incompleto");
  return result;
}
