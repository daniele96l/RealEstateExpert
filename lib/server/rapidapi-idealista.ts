import type { CityListingsCache, ListingDetail, MapListing } from "@/lib/types";
import { propertyTypeLabel } from "@/lib/listing-types";
import { resolveListingCondition } from "@/lib/renovation-status";
import { parseRapidPropertyPayload } from "./property-detail";
import { getRapidApiKey } from "./config";
import { geocodeCity, locationMatchesCity, normalizeCitySlug } from "./geocode";

const RAPIDAPI_HOST = "idealista17.p.rapidapi.com";
const IDEALISTA_BASE = "https://www.idealista.it";

export class RapidApiIdealistaError extends Error {}

interface SmartSearchLocation {
  name?: string;
  type?: string;
  url?: string;
  locationId?: string;
  total?: number;
}

interface RapidListing {
  propertyCode?: string | number;
  price?: number;
  priceInfo?: { price?: { amount?: number } };
  size?: number;
  rooms?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  url?: string;
  operation?: string;
  propertyType?: string;
  status?: string;
  propertyStatus?: string;
}

async function rapidApiGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://${RAPIDAPI_HOST}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": getRapidApiKey(),
    },
    next: { revalidate: 0 },
  });

  if (response.status === 401 || response.status === 403) {
    throw new RapidApiIdealistaError("Chiave RapidAPI non valida o piano insufficiente");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new RapidApiIdealistaError(`Errore RapidAPI ${response.status}: ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as { success?: boolean; message?: string; data?: T };
  if (body.success === false) {
    throw new RapidApiIdealistaError(body.message ?? "Richiesta RapidAPI non riuscita");
  }
  return body.data as T;
}

async function resolveLocationUrl(city: string, operation: "sale" | "rent"): Promise<string> {
  const searchType = operation === "sale" ? "for_sale" : "for_rent";
  const data = await rapidApiGet<{ searchText?: string; results?: SmartSearchLocation[] }>(
    "/smart-search",
    {
      language: "it",
      search_text: city.trim(),
      search_type: searchType,
      country: "it",
      property_type: "homes",
    },
  );

  const match =
    data.results?.find(
      (r) => r.type === "location" && r.url && r.name && locationMatchesCity(r.name, city),
    ) ??
    data.results?.find((r) => r.type === "location" && r.url) ??
    data.results?.[0];

  if (!match?.url) {
    throw new RapidApiIdealistaError(`Nessuna località trovata per "${city}"`);
  }

  return match.url.startsWith("http") ? match.url : `${IDEALISTA_BASE}${match.url}`;
}

function normalizeOperation(raw?: string, url?: string): "sale" | "rent" {
  const op = (raw ?? "").toLowerCase();
  if (op.includes("rent") || op.includes("affitto") || op.includes("alquiler")) return "rent";
  if (url?.toLowerCase().includes("affitto")) return "rent";
  return "sale";
}

function propertyFields(item: RapidListing): Pick<MapListing, "property_type" | "property_type_label"> {
  const raw = item.propertyType?.trim() || null;
  return {
    property_type: raw,
    property_type_label: raw ? propertyTypeLabel(raw) : null,
  };
}

function extractRapidListingStatus(item: RapidListing): string | null {
  const raw = item as RapidListing & Record<string, unknown>;
  const nested = raw.moreCharacteristics as Record<string, unknown> | undefined;
  const candidates = [
    item.status,
    item.propertyStatus,
    raw.preservation,
    raw.preservations,
    raw.condition,
    raw.conservation,
    nested?.status,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function listingFromRapid(item: RapidListing, operation: "sale" | "rent"): MapListing | null {
  const id = String(item.propertyCode ?? "");
  if (!id) return null;

  const price = item.price ?? item.priceInfo?.price?.amount;
  if (price == null || price <= 0) return null;

  const lat = item.latitude;
  const lng = item.longitude;
  if (lat == null || lng == null) return null;

  let url = item.url ?? `${IDEALISTA_BASE}/immobile/${id}/`;
  if (url.startsWith("/")) url = `${IDEALISTA_BASE}${url}`;

  const address = item.address ?? null;
  const title = address ?? `Immobile ${id}`;
  const conditionInfo = resolveListingCondition(extractRapidListingStatus(item), title);

  return {
    id,
    title: title.slice(0, 200),
    price,
    operation,
    url,
    lat,
    lng,
    sqm: item.size ?? null,
    rooms: item.rooms ?? null,
    address,
    ...propertyFields(item),
    ...conditionInfo,
  };
}

export function normalizeIdealistaListingUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new RapidApiIdealistaError("URL obbligatorio");

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new RapidApiIdealistaError("URL non valido");
  }

  if (!url.hostname.includes("idealista.it")) {
    throw new RapidApiIdealistaError("Inserisci un URL Idealista italiano (idealista.it)");
  }

  const idMatch = url.pathname.match(/\/immobile\/(\d+)/);
  if (!idMatch) {
    throw new RapidApiIdealistaError("URL non riconosciuto — usa un link del tipo idealista.it/immobile/12345678/");
  }

  return `https://www.idealista.it/immobile/${idMatch[1]}/`;
}

function listingFromRapidDetail(item: RapidListing, sourceUrl: string): MapListing | null {
  const idMatch = sourceUrl.match(/\/immobile\/(\d+)/);
  const id = String(item.propertyCode ?? idMatch?.[1] ?? "");
  if (!id) return null;

  const price = item.price ?? item.priceInfo?.price?.amount;
  if (price == null || price <= 0) return null;

  const operation = normalizeOperation(item.operation, sourceUrl);
  let url = item.url ?? sourceUrl;
  if (url.startsWith("/")) url = `${IDEALISTA_BASE}${url}`;

  const address = item.address ?? null;
  const title = (address ?? item.propertyType ?? `Immobile ${id}`).slice(0, 200);
  const conditionInfo = resolveListingCondition(extractRapidListingStatus(item), title);

  return {
    id,
    title,
    price,
    operation,
    url,
    lat: item.latitude ?? 0,
    lng: item.longitude ?? 0,
    sqm: item.size ?? null,
    rooms: item.rooms ?? null,
    address,
    ...propertyFields(item),
    ...conditionInfo,
  };
}

export async function fetchPropertyDetailsByUrl(
  url: string,
  base?: MapListing,
): Promise<ListingDetail> {
  const normalized = normalizeIdealistaListingUrl(url);
  const data = await rapidApiGet<{ property?: unknown; adId?: string }>("/property-details-by-url", {
    url: normalized,
    language: "it",
    country: "it",
  });

  const detail = parseRapidPropertyPayload(data, normalized, base);
  if (!detail.id || detail.price <= 0) {
    throw new RapidApiIdealistaError("Impossibile estrarre i dati dall'annuncio");
  }
  return detail;
}

export async function fetchCityListingsViaRapidApi(
  city: string,
  operation: "sale" | "rent",
  maxPages = 1,
): Promise<CityListingsCache> {
  const [centerData, searchUrl] = await Promise.all([
    geocodeCity(city),
    resolveLocationUrl(city, operation),
  ]);

  const byId = new Map<string, MapListing>();

  for (let page = 1; page <= maxPages; page++) {
    const data = await rapidApiGet<{
      listings?: RapidListing[];
      totalPages?: number;
      actualPage?: number;
    }>("/property-search-by-url", {
      url: searchUrl,
      page: String(page),
    });

    const batch = (data.listings ?? [])
      .map((item) => listingFromRapid(item, operation))
      .filter((l): l is MapListing => l != null);

    if (!batch.length) break;

    for (const listing of batch) byId.set(listing.id, listing);

    if (data.totalPages != null && page >= data.totalPages) break;
  }

  const listings = [...byId.values()];

  if (!listings.length) {
    throw new RapidApiIdealistaError(`Nessun annuncio trovato per ${city}`);
  }

  const avgLat = listings.reduce((s, l) => s + l.lat, 0) / listings.length;
  const avgLng = listings.reduce((s, l) => s + l.lng, 0) / listings.length;

  return {
    city: normalizeCitySlug(city),
    operation,
    fetched_at: new Date().toISOString(),
    center: {
      lat: centerData.lat || avgLat,
      lng: centerData.lng || avgLng,
      display_name: centerData.display_name ?? listings[0]?.address ?? city,
    },
    listings,
  };
}
