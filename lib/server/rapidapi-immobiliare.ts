import {
  extractImmobiliareListingId,
  immobiliareListingCacheId,
  normalizeImmobiliareListingUrl,
} from "@/lib/listing-url";
import type { CityListingsCache, MapListing } from "@/lib/types";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { geocodeCity, normalizeCitySlug } from "./geocode";
import {
  buildImmobiliareSearchUrl,
  mapSearchResultToListing,
  resolveImmobiliareLocation,
} from "./immobiliare-search";
import { mapRealEstateToDetail } from "./immobiliare-scraper";
import { getRapidApiKey, hasRapidApiKey } from "./config";
import { markRapidApiQuotaExhausted } from "./provider-quota";

const RAPIDAPI_HOST = "immobiliare-it-scraper.p.rapidapi.com";

export class RapidApiImmobiliareError extends Error {}

async function rapidApiGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`https://${RAPIDAPI_HOST}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": getRapidApiKey(),
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(60_000),
  });

  const text = await response.text();
  if (response.status === 403 && text.includes("not subscribed")) {
    throw new RapidApiImmobiliareError(
      'Abbonati a "Immobiliare.it Scraper" su RapidAPI (immobiliare-it-scraper) per importare annunci Immobiliare.',
    );
  }
  if (response.status === 429) {
    markRapidApiQuotaExhausted();
    throw new RapidApiImmobiliareError(
      "Limite mensile RapidAPI esaurito. Verranno usati provider alternativi.",
    );
  }
  if (!response.ok) {
    throw new RapidApiImmobiliareError(
      `RapidAPI Immobiliare (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RapidApiImmobiliareError("Risposta RapidAPI Immobiliare non valida");
  }
}

function unwrapPayload(data: unknown): Record<string, unknown> {
  const obj = data != null && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
  if (!obj) return {};

  for (const key of ["data", "result", "listing", "realEstate", "property", "item"]) {
    const nested = obj[key];
    if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return obj;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contractParam(operation: "sale" | "rent"): string {
  return operation === "rent" ? "rent" : "sale";
}

function listingUrlFromRow(row: Record<string, unknown>, numericId: string): string {
  const raw =
    row.url ??
    row.link ??
    row.listingUrl ??
    row.propertyUrl ??
    row.detailUrl;
  if (typeof raw === "string" && raw.includes("immobiliare.it")) {
    return raw.startsWith("http") ? raw : `https://www.immobiliare.it${raw}`;
  }
  return `https://www.immobiliare.it/annunci/${numericId}/`;
}

function numericIdFromRow(row: Record<string, unknown>): string | null {
  const candidates = [
    row.id,
    row.propertyId,
    row.property_id,
    row.listingId,
    row.listing_id,
    row.realEstateId,
    row.code,
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const id = String(value).replace(/\D/g, "");
    if (id) return id;
  }
  const url = row.url ?? row.link;
  if (typeof url === "string") return extractImmobiliareListingId(url);
  return null;
}

function rowToMapListing(row: Record<string, unknown>, operation: "sale" | "rent"): MapListing | null {
  if (row.realEstate != null) {
    try {
      return mapSearchResultToListing(row, operation);
    } catch {
      /* try flat parse */
    }
  }

  const numericId = numericIdFromRow(row);
  if (!numericId) return null;

  const url = listingUrlFromRow(row, numericId);
  try {
    const detail = mapRealEstateToDetail(row, url, numericId);
    if (detail.price <= 0) return null;
    return {
      id: detail.id,
      title: detail.title,
      price: detail.price,
      operation: detail.operation === "rent" || operation === "rent" ? "rent" : "sale",
      url: detail.url,
      lat: detail.lat,
      lng: detail.lng,
      sqm: detail.sqm,
      rooms: detail.rooms,
      address: detail.address,
      property_type: detail.property_type,
      property_type_label: detail.property_type_label,
      condition_status: detail.condition_status,
      condition: detail.condition,
      needs_renovation: detail.needs_renovation,
    };
  } catch {
    const price = Number(row.price ?? row.priceValue ?? row.price_value ?? 0);
    const lat = Number(row.latitude ?? row.lat ?? 0);
    const lng = Number(row.longitude ?? row.lng ?? 0);
    if (!price || !lat || !lng) return null;
    return {
      id: immobiliareListingCacheId(numericId),
      title: String(row.title ?? row.address ?? `Annuncio ${numericId}`).slice(0, 200),
      price,
      operation,
      url,
      lat,
      lng,
      sqm: row.surface != null ? Number(row.surface) : row.sqm != null ? Number(row.sqm) : null,
      rooms: row.rooms != null ? Number(row.rooms) : row.locali != null ? Number(row.locali) : null,
      address: typeof row.address === "string" ? row.address : null,
      property_type: typeof row.propertyType === "string" ? row.propertyType : null,
      property_type_label: typeof row.propertyType === "string" ? row.propertyType : null,
      condition_status: null,
      condition: null,
      needs_renovation: null,
    };
  }
}

function extractListingRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
  }

  const root = asRecord(data);
  if (!root) return [];

  for (const key of ["listings", "results", "data", "items", "rows"]) {
    const value = root[key];
    if (Array.isArray(value) && value.length) {
      return value.map(asRecord).filter((row): row is Record<string, unknown> => row != null);
    }
  }

  const nested = root.search ?? root.response ?? root.payload;
  if (nested != null && nested !== root) {
    return extractListingRows(nested);
  }

  return [];
}

function parseRapidSearchListings(data: unknown, operation: "sale" | "rent"): MapListing[] {
  const byId = new Map<string, MapListing>();
  for (const row of extractListingRows(data)) {
    const listing = rowToMapListing(row, operation);
    if (listing) byId.set(listing.id, listing);
  }
  return [...byId.values()];
}

async function fetchSearchPage(
  operation: "sale" | "rent",
  params: Record<string, string>,
): Promise<MapListing[]> {
  const data = await rapidApiGet("/search/bylocation", {
    contract: contractParam(operation),
    ...params,
  });
  return parseRapidSearchListings(data, operation);
}

export async function fetchCityListingsViaRapidApi(
  city: string,
  operation: "sale" | "rent",
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  if (!hasRapidApiKey()) {
    throw new RapidApiImmobiliareError("RAPIDAPI_KEY non configurata in .env.local");
  }

  const location = city.trim();
  const [centerData] = await Promise.all([geocodeCity(location)]);

  const byId = new Map<string, MapListing>();

  const ingest = (data: unknown) => {
    for (const listing of parseRapidSearchListings(data, operation)) {
      byId.set(listing.id, listing);
    }
  };

  try {
    ingest(
      await rapidApiGet("/search/bylocation", {
        location,
        contract: contractParam(operation),
        pages: String(maxPages),
      }),
    );
  } catch (err) {
    if (err instanceof RapidApiImmobiliareError) throw err;
  }

  if (!byId.size) {
    try {
      const immoLoc = await resolveImmobiliareLocation(location);
      const searchUrl = buildImmobiliareSearchUrl(immoLoc, operation);
      ingest(
        await rapidApiGet("/search/byurl", {
          url: searchUrl,
          pages: String(maxPages),
        }),
      );
    } catch (err) {
      if (err instanceof RapidApiImmobiliareError) throw err;
    }
  }

  if (byId.size && onPage) {
    onPage({
      operation,
      page: Math.min(maxPages, 1),
      maxPages,
      listingsTotal: byId.size,
    });
  }

  if (!byId.size) {
    for (let page = 1; page <= maxPages; page++) {
      let batch: MapListing[];
      try {
        batch = await fetchSearchPage(operation, { location, pag: String(page) });
      } catch (err) {
        if (err instanceof RapidApiImmobiliareError) throw err;
        break;
      }
      if (!batch.length) break;
      for (const listing of batch) byId.set(listing.id, listing);
      onPage?.({
        operation,
        page,
        maxPages,
        listingsTotal: byId.size,
      });
      if (batch.length < 15) break;
    }
  }

  const listings = [...byId.values()];
  if (!listings.length) {
    throw new RapidApiImmobiliareError(
      `Nessun annuncio Immobiliare trovato per ${location}. Verifica l'abbonamento a "Immobiliare.it Scraper" su RapidAPI.`,
    );
  }

  const withCoords = listings.filter((l) => l.lat !== 0 && l.lng !== 0);
  const avgLat =
    withCoords.length > 0
      ? withCoords.reduce((s, l) => s + l.lat, 0) / withCoords.length
      : centerData.lat;
  const avgLng =
    withCoords.length > 0
      ? withCoords.reduce((s, l) => s + l.lng, 0) / withCoords.length
      : centerData.lng;

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

export async function fetchImmobiliareListingPayload(url: string): Promise<Record<string, unknown>> {
  if (!hasRapidApiKey()) {
    throw new RapidApiImmobiliareError("RAPIDAPI_KEY non configurata in .env.local");
  }

  const normalized = normalizeImmobiliareListingUrl(url);
  const numericId = extractImmobiliareListingId(normalized);
  if (!numericId) throw new RapidApiImmobiliareError("ID annuncio non trovato nell'URL");

  try {
    return unwrapPayload(await rapidApiGet("/details/byurl", { url: normalized }));
  } catch (byUrlError) {
    try {
      return unwrapPayload(await rapidApiGet("/details/byid", { id: numericId }));
    } catch {
      throw byUrlError;
    }
  }
}
