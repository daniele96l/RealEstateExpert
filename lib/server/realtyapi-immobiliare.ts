import { immobiliareListingCacheId } from "@/lib/listing-url";
import type { CityListingsCache, MapListing } from "@/lib/types";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { getRealtyApiKey, hasRealtyApiKey } from "./config";
import { geocodeCity, normalizeCitySlug } from "./geocode";

const REALTYAPI_BASE = "https://immobiliare.realtyapi.io";

export class RealtyApiImmobiliareError extends Error {}

interface RealtySearchResult {
  id?: number | string;
  url?: string;
  title?: string;
  price?: number;
  surface?: number;
  rooms?: string | number;
  propertyType?: string;
  location?: {
    street?: string;
    latitude?: number;
    longitude?: number;
    municipality?: { name?: string };
  };
}

interface RealtySearchResponse {
  searchResults?: RealtySearchResult[];
  nextPage?: boolean;
  total?: number;
  message?: string;
  error?: string;
}

async function realtyApiGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${REALTYAPI_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { "x-realtyapi-key": getRealtyApiKey() },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(90_000),
  });

  const text = await response.text();
  let data: RealtySearchResponse & Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as RealtySearchResponse & Record<string, unknown>;
  } catch {
    throw new RealtyApiImmobiliareError(`Risposta RealtyAPI non valida (${response.status})`);
  }

  if (response.status === 401) {
    throw new RealtyApiImmobiliareError("REALTYAPI_KEY non valida. Verifica la chiave su realtyapi.io/dashboard");
  }
  if (response.status === 402) {
    throw new RealtyApiImmobiliareError("Crediti RealtyAPI esauriti. Ricarica su realtyapi.io/dashboard");
  }
  if (!response.ok) {
    const detail = typeof data.error === "string" ? data.error : text.slice(0, 200);
    throw new RealtyApiImmobiliareError(`RealtyAPI Immobiliare (${response.status}): ${detail}`);
  }

  return data as T;
}

function parseRooms(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function listingFromRealtyResult(item: RealtySearchResult, operation: "sale" | "rent"): MapListing | null {
  const numericId = item.id != null ? String(item.id) : null;
  if (!numericId) return null;

  const price = item.price;
  const lat = item.location?.latitude;
  const lng = item.location?.longitude;
  if (price == null || price <= 0 || lat == null || lng == null) return null;

  const url =
    item.url?.startsWith("http")
      ? item.url
      : `https://www.immobiliare.it/annunci/${numericId}/`;

  return {
    id: immobiliareListingCacheId(numericId),
    title: (item.title ?? `Annuncio ${numericId}`).slice(0, 200),
    price,
    operation,
    url,
    lat,
    lng,
    sqm: item.surface ?? null,
    rooms: parseRooms(item.rooms),
    address: item.location?.street ?? item.location?.municipality?.name ?? null,
    property_type: item.propertyType ?? null,
    property_type_label: item.propertyType ?? null,
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

function searchType(operation: "sale" | "rent"): string {
  return operation === "rent" ? "For_Rent" : "For_Sale";
}

export async function fetchCityListingsViaRealtyApi(
  city: string,
  operation: "sale" | "rent",
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  if (!hasRealtyApiKey()) {
    throw new RealtyApiImmobiliareError("REALTYAPI_KEY non configurata in .env.local");
  }

  const location = city.trim();
  const centerData = await geocodeCity(location);
  const byId = new Map<string, MapListing>();

  for (let page = 1; page <= maxPages; page++) {
    const data = await realtyApiGet<RealtySearchResponse>("/search/bylocation", {
      location,
      searchType: searchType(operation),
      page: String(page),
      resultCount: "20",
    });

    const batch = (data.searchResults ?? [])
      .map((item) => listingFromRealtyResult(item, operation))
      .filter((listing): listing is MapListing => listing != null);

    for (const listing of batch) byId.set(listing.id, listing);

    onPage?.({
      operation,
      page,
      maxPages,
      listingsTotal: byId.size,
    });

    if (!batch.length || !data.nextPage) break;
  }

  const listings = [...byId.values()];
  if (!listings.length) {
    throw new RealtyApiImmobiliareError(`Nessun annuncio Immobiliare trovato per ${location}`);
  }

  const avgLat = listings.reduce((s, l) => s + l.lat, 0) / listings.length;
  const avgLng = listings.reduce((s, l) => s + l.lng, 0) / listings.length;

  return {
    city: normalizeCitySlug(location),
    operation,
    fetched_at: new Date().toISOString(),
    center: {
      lat: centerData.lat || avgLat,
      lng: centerData.lng || avgLng,
      display_name: centerData.display_name ?? location,
    },
    listings,
  };
}
