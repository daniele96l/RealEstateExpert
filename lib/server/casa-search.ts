import vm from "node:vm";
import type { CityListingsCache, MapListing } from "@/lib/types";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { geocodeCity } from "./geocode";
import { portalPageDelay, withPortalBrowser } from "./portal-browser";

export class CasaSearchError extends Error {}

const CASA_BASE = "https://www.casa.it";

interface CasaListingRow {
  id?: number;
  uri?: string;
  title?: { main?: string; additional?: string[] };
  features?: {
    mq?: number;
    rooms?: number;
    price?: { value?: string; marker?: { originalPrice?: number } };
  };
  geoInfos?: {
    lat?: number;
    lon?: number;
    street?: string;
    district_name?: string;
    city?: string;
  };
  propertyType?: string;
}

interface CasaInitialState {
  agencySrp?: {
    list?: CasaListingRow[];
    paginator?: { totalPages?: number; currentPage?: number };
  };
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && raw > 0) return raw;
  const cleaned = String(raw).replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function extractCasaInitialState(html: string): CasaInitialState {
  if (/accesso\s+temporaneamente\s+limitato/i.test(html) || html.includes("captcha-delivery.com")) {
    throw new CasaSearchError("Accesso a Casa.it bloccato (captcha o rate limit).");
  }

  const marker = "window.__INITIAL_STATE__ = JSON.parse(";
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new CasaSearchError("Pagina Casa.it senza dati annunci (__INITIAL_STATE__ mancante).");
  }

  const scriptChunk = html.slice(start);
  const parseCall = scriptChunk.match(/JSON\.parse\([\s\S]*?\)\s*;/)?.[0];
  if (!parseCall) {
    throw new CasaSearchError("Risposta Casa.it non valida (JSON corrotto).");
  }

  try {
    return vm.runInNewContext(`(${parseCall.replace(/;$/, "")})`) as CasaInitialState;
  } catch {
    throw new CasaSearchError("Risposta Casa.it non valida (JSON corrotto).");
  }
}

export function casaListingCacheId(id: number | string): string {
  return `ca_${id}`;
}

export function mapCasaListing(row: CasaListingRow): MapListing | null {
  if (row.id == null) return null;
  const price =
    parsePrice(row.features?.price?.marker?.originalPrice) ??
    parsePrice(row.features?.price?.value);
  if (price == null) return null;

  const lat = row.geoInfos?.lat;
  const lng = row.geoInfos?.lon;
  const path = row.uri?.startsWith("/") ? row.uri : `/${row.uri ?? ""}`;
  const url = `${CASA_BASE}${path}`.replace(/([^:]\/)\/+/g, "$1");

  const addressParts = [
    row.geoInfos?.street,
    row.geoInfos?.district_name,
    row.geoInfos?.city,
  ].filter(Boolean);

  return {
    id: casaListingCacheId(row.id),
    title: row.title?.main?.trim() || `Annuncio ${row.id}`,
    price,
    operation: "rent",
    url,
    lat: lat ?? 0,
    lng: lng ?? 0,
    sqm: row.features?.mq ?? null,
    rooms: row.features?.rooms ?? null,
    address: addressParts.length ? addressParts.join(", ") : row.title?.main ?? null,
    property_type: row.propertyType ?? null,
    property_type_label: row.propertyType ?? null,
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

export function parseCasaSearchHtml(html: string): MapListing[] {
  const state = extractCasaInitialState(html);
  const rows = state.agencySrp?.list ?? [];
  return rows
    .map(mapCasaListing)
    .filter((listing): listing is MapListing => listing != null);
}

function searchPageUrl(page: number): string {
  const base = `${CASA_BASE}/affitto/residenziale/reggio-calabria/`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

function casaPageHasContent(html: string): boolean {
  return html.includes("__INITIAL_STATE__") || html.includes("/immobili/");
}

export async function fetchCasaCityListings(
  maxPages?: number,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  const resolvedMaxPages = Math.min(resolveItalyListingMaxPages(maxPages ?? 10), 10);
  const byId = new Map<string, MapListing>();

  await withPortalBrowser(
    async (session) => {
      for (let page = 1; page <= resolvedMaxPages; page++) {
        const before = byId.size;
        const html = await session.fetchHtml(searchPageUrl(page), {
          warmup: page === 1 ? "https://www.casa.it/" : undefined,
        });
        const listings = parseCasaSearchHtml(html);
        if (!listings.length) break;

        for (const listing of listings) {
          byId.set(listing.id, listing);
        }

        onPage?.({
          operation: "rent",
          page,
          maxPages: resolvedMaxPages,
          listingsTotal: byId.size,
        });

        if (byId.size === before) break;
        const state = extractCasaInitialState(html);
        const totalPages = state.agencySrp?.paginator?.totalPages ?? page;
        if (page >= totalPages) break;
        await portalPageDelay();
      }
    },
    { warmupUrl: "https://www.casa.it/", pageHasContent: casaPageHasContent },
  );

  const listings = [...byId.values()];
  if (!listings.length) {
    throw new CasaSearchError("Nessun annuncio Casa.it per Reggio Calabria");
  }

  const centerData = await geocodeCity("Reggio Calabria", "it");
  const withCoords = listings.filter((l) => l.lat !== 0 || l.lng !== 0);
  const avgLat =
    withCoords.length > 0
      ? withCoords.reduce((sum, l) => sum + l.lat, 0) / withCoords.length
      : centerData.lat;
  const avgLng =
    withCoords.length > 0
      ? withCoords.reduce((sum, l) => sum + l.lng, 0) / withCoords.length
      : centerData.lng;

  return {
    city: "reggio_calabria",
    operation: "rent",
    fetched_at: new Date().toISOString(),
    center: {
      lat: centerData.lat || avgLat,
      lng: centerData.lng || avgLng,
      display_name: centerData.display_name ?? "Reggio Calabria",
    },
    listings,
    provider: "casa_scraper",
  };
}
