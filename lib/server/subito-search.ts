import type { CityListingsCache, MapListing } from "@/lib/types";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { geocodeCity } from "./geocode";
import { portalPageDelay, withPortalBrowser } from "./portal-browser";

export class SubitoSearchError extends Error {}

const SUBITO_BASE = "https://www.subito.it";
const SUBITO_SEARCH_PATH = "/annunci-calabria/affitto/appartamenti/reggio-calabria/";

interface SubitoFeatureValue {
  key?: string;
  value?: string;
}

interface SubitoFeature {
  uri?: string;
  values?: SubitoFeatureValue[];
}

interface SubitoAdItem {
  urn?: string;
  subject?: string;
  features?: Record<string, SubitoFeature>;
  geo?: {
    map?: { latitude?: string; longitude?: string; address?: string };
    town?: { value?: string };
    city?: { value?: string };
  };
  urls?: { default?: string; mobile?: string };
}

interface SubitoInitialState {
  items?: {
    originalList?: SubitoAdItem[];
    totalPages?: number;
    total?: number;
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

export function extractSubitoNextData(html: string): SubitoInitialState {
  if (/accesso\s+temporaneamente\s+limitato/i.test(html) || html.includes("captcha-delivery.com")) {
    throw new SubitoSearchError("Accesso a Subito.it bloccato (captcha o rate limit).");
  }

  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new SubitoSearchError("Pagina Subito.it senza dati annunci (__NEXT_DATA__ mancante).");
  }

  let data: { props?: { pageProps?: { initialState?: SubitoInitialState } } };
  try {
    data = JSON.parse(match[1]) as typeof data;
  } catch {
    throw new SubitoSearchError("Risposta Subito.it non valida (JSON corrotto).");
  }

  return data.props?.pageProps?.initialState ?? {};
}

function featureValue(features: Record<string, SubitoFeature> | undefined, uri: string): string | null {
  const feat = features?.[uri];
  const raw = feat?.values?.[0]?.key ?? feat?.values?.[0]?.value;
  return raw != null ? String(raw) : null;
}

export function subitoListingCacheId(id: string): string {
  return `sb_${id}`;
}

export function extractSubitoListingId(item: SubitoAdItem): string | null {
  const url = item.urls?.default ?? item.urls?.mobile ?? "";
  const fromUrl = url.match(/-(\d+)\.htm/i)?.[1];
  if (fromUrl) return fromUrl;

  const listMatch = item.urn?.match(/:list:(\d+)/);
  return listMatch?.[1] ?? null;
}

export function mapSubitoListing(item: SubitoAdItem): MapListing | null {
  const id = extractSubitoListingId(item);
  if (!id) return null;

  const price = parsePrice(featureValue(item.features, "/price"));
  if (price == null) return null;

  const lat = parsePrice(item.geo?.map?.latitude);
  const lng = parsePrice(item.geo?.map?.longitude);
  const url = item.urls?.default ?? item.urls?.mobile ?? `${SUBITO_BASE}/`;

  const sqmRaw = featureValue(item.features, "/size");
  const sqm = sqmRaw ? parsePrice(sqmRaw) : null;
  const roomsRaw = featureValue(item.features, "/room");
  const rooms = roomsRaw ? parseInt(roomsRaw, 10) : null;

  const address =
    item.geo?.map?.address ??
    ([item.geo?.town?.value, item.geo?.city?.value].filter(Boolean).join(", ") ||
      item.subject ||
      null);

  return {
    id: subitoListingCacheId(id),
    title: item.subject?.trim() || `Annuncio ${id}`,
    price,
    operation: "rent",
    url,
    lat: lat ?? 0,
    lng: lng ?? 0,
    sqm: Number.isFinite(sqm) ? sqm : null,
    rooms: Number.isFinite(rooms) ? rooms : null,
    address,
    property_type: "appartamento",
    property_type_label: "Appartamento",
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

export function parseSubitoSearchHtml(html: string): {
  listings: MapListing[];
  totalPages: number;
} {
  const state = extractSubitoNextData(html);
  const rows = state.items?.originalList ?? [];
  const listings = rows
    .map(mapSubitoListing)
    .filter((listing): listing is MapListing => listing != null);
  return {
    listings,
    totalPages: state.items?.totalPages ?? 1,
  };
}

function searchPageUrl(page: number): string {
  const base = `${SUBITO_BASE}${SUBITO_SEARCH_PATH}`;
  return page <= 1 ? base : `${base}?o=${page}`;
}

function subitoPageHasContent(html: string): boolean {
  return html.includes("__NEXT_DATA__") || html.includes("originalList");
}

export async function fetchSubitoCityListings(
  maxPages?: number,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  const resolvedMaxPages = Math.min(resolveItalyListingMaxPages(maxPages ?? 10), 10);
  const byId = new Map<string, MapListing>();
  let siteTotalPages = 1;

  await withPortalBrowser(
    async (session) => {
      for (let page = 1; page <= resolvedMaxPages; page++) {
        const before = byId.size;
        const html = await session.fetchHtml(searchPageUrl(page), {
          forceNavigation: true,
          warmup: page === 1 ? "https://www.subito.it/" : undefined,
        });
        const { listings, totalPages } = parseSubitoSearchHtml(html);
        siteTotalPages = totalPages;
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
        if (page >= siteTotalPages) break;
        await portalPageDelay();
      }
    },
    { warmupUrl: "https://www.subito.it/", pageHasContent: subitoPageHasContent },
  );

  const listings = [...byId.values()];
  if (!listings.length) {
    throw new SubitoSearchError("Nessun annuncio Subito.it per Reggio Calabria");
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
    provider: "subito_scraper",
  };
}
