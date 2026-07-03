import type { CityListingsCache, MapListing } from "@/lib/types";
import { getMarket, listingsCacheSlug, type MarketId } from "@/lib/markets";
import { geocodeCity } from "./geocode";

export class SrealitySearchError extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface SrealityLocality {
  city?: string;
  citySeoName?: string;
  cityPart?: string;
  cityPartSeoName?: string;
  street?: string;
  streetSeoName?: string;
  latitude?: number;
  longitude?: number;
}

interface SrealityEstate {
  id: number;
  name: string;
  priceCzk?: number;
  priceSummaryCzk?: number;
  categorySubCb?: { name?: string; value?: number };
  categoryTypeCb?: { name?: string; value?: number };
  locality?: SrealityLocality;
}

interface SrealitySearchPayload {
  results?: SrealityEstate[];
  pagination?: { limit?: number; total?: number };
}

interface NextData {
  props?: {
    pageProps?: {
      dehydratedState?: {
        queries?: Array<{
          queryKey?: unknown[];
          state?: { data?: SrealitySearchPayload };
        }>;
      };
    };
  };
}

function parseRoomsFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*\+(?:kk|1)/i) ?? name.match(/(\d+)\s*\+\s*(\d+)/);
  if (m) return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  const flat = name.match(/(\d+)\s*kk/i);
  if (flat) return parseInt(flat[1], 10);
  return null;
}

function parseSqmFromName(name: string): number | null {
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*m²/i) ?? name.match(/(\d+(?:[.,]\d+)?)\s*m2/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function searchPageUrl(citySeo: string, operation: "sale" | "rent", page: number): string {
  const kind = operation === "sale" ? "prodej" : "pronajem";
  const base = `https://www.sreality.cz/hledani/${kind}/byty/${citySeo}`;
  return page > 1 ? `${base}?strana=${page}` : base;
}

function extractSearchPayload(html: string): SrealitySearchPayload {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new SrealitySearchError("Pagina Sreality senza dati annunci (__NEXT_DATA__ mancante).");
  }

  let data: NextData;
  try {
    data = JSON.parse(match[1]) as NextData;
  } catch {
    throw new SrealitySearchError("Risposta Sreality non valida (JSON corrotto).");
  }

  const queries = data.props?.pageProps?.dehydratedState?.queries ?? [];
  for (const query of queries) {
    if (query.queryKey?.[0] === "estatesSearch") {
      return query.state?.data ?? {};
    }
  }

  throw new SrealitySearchError("Nessun risultato Sreality nella pagina di ricerca.");
}

function estateAddress(locality: SrealityLocality | undefined): string | null {
  if (!locality) return null;
  const parts = [locality.street, locality.cityPart, locality.city].filter(Boolean);
  return parts.length ? parts.join(", ") : locality.city ?? null;
}

function estateDetailSlug(locality: SrealityLocality | undefined): string {
  if (!locality?.citySeoName) return "brno";
  const parts = [locality.citySeoName, locality.cityPartSeoName, locality.streetSeoName].filter(Boolean);
  return parts.join("-") || locality.citySeoName;
}

function estateUrl(estate: SrealityEstate, operation: "sale" | "rent"): string {
  const kind = operation === "sale" ? "prodej" : "pronajem";
  const rooms = encodeURIComponent(estate.categorySubCb?.name ?? "byt").replace(/%2B/g, "+");
  const slug = estateDetailSlug(estate.locality);
  return `https://www.sreality.cz/detail/${kind}/byt/${rooms}/${slug}/${estate.id}`;
}

function estatePrice(estate: SrealityEstate): number | null {
  const raw = estate.priceCzk ?? estate.priceSummaryCzk;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return null;
  return Number(raw);
}

function mapEstate(estate: SrealityEstate, operation: "sale" | "rent"): MapListing | null {
  const price = estatePrice(estate);
  const lat = estate.locality?.latitude;
  const lng = estate.locality?.longitude;
  if (price == null || lat == null || lng == null) return null;

  const name = estate.name ?? `Byt ${estate.id}`;
  return {
    id: `sr_${estate.id}`,
    title: name,
    price,
    operation,
    url: estateUrl(estate, operation),
    lat: Number(lat),
    lng: Number(lng),
    sqm: parseSqmFromName(name),
    rooms: parseRoomsFromName(name),
    address: estateAddress(estate.locality),
    property_type: "flat",
    property_type_label: "Byt",
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

async function fetchSrealityPage(
  citySeo: string,
  operation: "sale" | "rent",
  page: number,
): Promise<SrealitySearchPayload> {
  const response = await fetch(searchPageUrl(citySeo, operation, page), {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
      Referer: "https://www.sreality.cz/",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new SrealitySearchError(
      `Sreality error ${response.status}. Verifica connessione o riprova più tardi.`,
    );
  }

  const html = await response.text();
  return extractSearchPayload(html);
}

function citySeoName(city: string): string {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "brno";
}

export async function fetchSrealityCityListings(
  city: string,
  operation: "sale" | "rent",
  market: MarketId = "cz",
  opts?: { maxPages?: number },
): Promise<CityListingsCache> {
  const cfg = getMarket(market);
  if (cfg.srealityRegionId == null) {
    throw new SrealitySearchError(`Sreality non supportato per ${city}`);
  }

  const maxPages = Math.max(1, opts?.maxPages ?? 3);
  const byId = new Map<string, MapListing>();
  const seo = citySeoName(city);
  let prevPageIds: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchSrealityPage(seo, operation, page);
    const estates = data.results ?? [];
    if (!estates.length) break;

    const pageIds = estates.map((e) => String(e.id));
    if (page > 1 && pageIds.join(",") === prevPageIds.join(",")) break;
    prevPageIds = pageIds;

    for (const estate of estates) {
      const listing = mapEstate(estate, operation);
      if (listing) byId.set(listing.id, listing);
    }

    if (page >= maxPages) break;
  }

  const listings = [...byId.values()];
  if (!listings.length) {
    throw new SrealitySearchError(`Nessun annuncio Sreality per ${city} (${operation})`);
  }

  const centerGeo = await geocodeCity(city, market);
  const avgLat = listings.reduce((s, l) => s + l.lat, 0) / listings.length;
  const avgLng = listings.reduce((s, l) => s + l.lng, 0) / listings.length;

  return {
    city: listingsCacheSlug(market, city),
    operation,
    fetched_at: new Date().toISOString(),
    center: {
      lat: centerGeo.lat || avgLat,
      lng: centerGeo.lng || avgLng,
      display_name: centerGeo.display_name ?? city,
    },
    listings,
    provider: "sreality",
  };
}
