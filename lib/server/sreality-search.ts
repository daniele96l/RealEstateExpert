import type { CityListingsCache, MapListing } from "@/lib/types";
import { getMarket, listingsCacheSlug, type MarketId } from "@/lib/markets";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { geocodeCity } from "./geocode";
import {
  extractSrealityListingDates,
  srealityEstateIdFromListingId,
} from "./sreality-dates";
import { CITY_SEO_ALIASES, citySeoName } from "./sreality-locality";

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
  categoryMainCb?: { name?: string; value?: number };
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

/** Sreality search path segment: flats (`byty`) or rooms (`pokoj`, rent only). */
type SrealitySearchKind = "byty" | "pokoj";

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

interface SrealityRegionSearch {
  region: string;
  regionId: number;
  regionTyp: string;
}

/** Municipalities searched via ?region=… (no /byty/{slug} path on Sreality). */
const SREALITY_REGION_CITIES: Record<string, SrealityRegionSearch> = {
  rosice: { region: "Rosice", regionId: 6240, regionTyp: "municipality" },
};

function resolveSrealityRegion(city: string): SrealityRegionSearch | null {
  return SREALITY_REGION_CITIES[citySeoName(city)] ?? null;
}

function isSrealityRoomEstate(
  estate: Pick<SrealityEstate, "categorySubCb">,
  kind?: SrealitySearchKind,
): boolean {
  if (kind === "pokoj") return true;
  const sub = estate.categorySubCb?.name?.trim().toLowerCase() ?? "";
  return sub === "pokoj";
}

function searchPageUrl(
  citySeo: string,
  operation: "sale" | "rent",
  page: number,
  kind: SrealitySearchKind = "byty",
  region?: SrealityRegionSearch | null,
): string {
  const op = operation === "sale" ? "prodej" : "pronajem";
  if (region) {
    const params = new URLSearchParams({
      region: region.region,
      "region-id": String(region.regionId),
      "region-typ": region.regionTyp,
    });
    if (page > 1) params.set("strana", String(page));
    return `https://www.sreality.cz/hledani/${op}/${kind}?${params}`;
  }
  const base = `https://www.sreality.cz/hledani/${op}/${kind}/${citySeo}`;
  return page > 1 ? `${base}?strana=${page}` : base;
}


function srealityCitySlugCandidates(city: string): string[] {
  const primary = citySeoName(city);
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (slug: string) => {
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push(slug);
  };

  add(primary);
  add(CITY_SEO_ALIASES[primary] ?? "");
  if (primary.includes("-")) add(primary.split("-")[0] ?? "");

  return out.length ? out : ["brno"];
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

function estateUrl(estate: SrealityEstate, operation: "sale" | "rent"): string {
  const kind = operation === "sale" ? "prodej" : "pronajem";
  const rooms = encodeURIComponent(estate.categorySubCb?.name ?? "byt").replace(/%2B/g, "+");
  // Locality slug `_` lets Sreality redirect to the canonical path (avoids broken/partial slugs).
  return `https://www.sreality.cz/detail/${kind}/byt/${rooms}/_/${estate.id}?noredirect=1`;
}

function estatePrice(estate: SrealityEstate): number | null {
  const raw = estate.priceCzk ?? estate.priceSummaryCzk;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return null;
  return Number(raw);
}

function mapEstate(
  estate: SrealityEstate,
  operation: "sale" | "rent",
  kind: SrealitySearchKind = "byty",
): MapListing | null {
  const price = estatePrice(estate);
  const lat = estate.locality?.latitude;
  const lng = estate.locality?.longitude;
  if (price == null || lat == null || lng == null) return null;

  const isRoom = isSrealityRoomEstate(estate, kind);
  const name = estate.name ?? (isRoom ? `Pokoj ${estate.id}` : `Byt ${estate.id}`);
  return {
    id: `sr_${estate.id}`,
    title: name,
    price,
    operation,
    url: estateUrl(estate, operation),
    lat: Number(lat),
    lng: Number(lng),
    sqm: parseSqmFromName(name),
    rooms: isRoom ? 1 : parseRoomsFromName(name),
    address: estateAddress(estate.locality),
    property_type: isRoom ? "room" : "flat",
    property_type_label: isRoom ? "Pokoj" : "Byt",
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

interface SrealityApiEstateResult {
  since?: string | null;
  edited?: string | null;
}

async function fetchSrealityListingDatesFromApi(
  estateId: number,
): Promise<{ listing_published_at: string | null; listing_updated_at: string | null }> {
  const response = await fetch(`https://www.sreality.cz/api/v1/estates/${estateId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      Referer: "https://www.sreality.cz/",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return { listing_published_at: null, listing_updated_at: null };
  }

  const payload = (await response.json()) as { result?: SrealityApiEstateResult };
  return extractSrealityListingDates(payload.result);
}

async function enrichSrealityListingsWithDates(listings: MapListing[]): Promise<MapListing[]> {
  const enriched: MapListing[] = [];

  for (const listing of listings) {
    if (listing.listing_published_at && listing.listing_updated_at) {
      enriched.push(listing);
      continue;
    }

    const estateId = srealityEstateIdFromListingId(listing.id);
    if (!estateId) {
      enriched.push(listing);
      continue;
    }

    try {
      const dates = await fetchSrealityListingDatesFromApi(estateId);
      enriched.push({
        ...listing,
        listing_published_at: listing.listing_published_at ?? dates.listing_published_at,
        listing_updated_at: listing.listing_updated_at ?? dates.listing_updated_at,
      });
    } catch {
      enriched.push(listing);
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return enriched;
}

async function fetchSrealityPage(
  citySeo: string,
  operation: "sale" | "rent",
  page: number,
  kind: SrealitySearchKind = "byty",
  region?: SrealityRegionSearch | null,
): Promise<SrealitySearchPayload | null> {
  const response = await fetch(searchPageUrl(citySeo, operation, page, kind, region), {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
      Referer: "https://www.sreality.cz/",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 404) {
    // Sreality returns 404 beyond the last page — stop pagination quietly.
    if (page > 1) return null;
    return null;
  }

  if (!response.ok) {
    throw new SrealitySearchError(
      `Sreality error ${response.status}. Verifica connessione o riprova più tardi.`,
    );
  }

  const html = await response.text();
  return extractSearchPayload(html);
}

async function openSrealityCitySearch(
  city: string,
  operation: "sale" | "rent",
  kind: SrealitySearchKind = "byty",
): Promise<{ seo: string; region: SrealityRegionSearch | null; firstPage: SrealitySearchPayload } | null> {
  const region = resolveSrealityRegion(city);
  if (region) {
    const seo = citySeoName(city);
    const firstPage = await fetchSrealityPage(seo, operation, 1, kind, region);
    if (firstPage) return { seo, region, firstPage };
    if (kind === "pokoj") return null;
    throw new SrealitySearchError(
      `Località non trovata su Sreality per «${city.trim()}».`,
    );
  }

  let last404 = false;
  for (const slug of srealityCitySlugCandidates(city)) {
    const firstPage = await fetchSrealityPage(slug, operation, 1, kind);
    if (firstPage) return { seo: slug, region: null, firstPage };
    last404 = true;
  }

  if (kind === "pokoj") return null;

  if (last404) {
    throw new SrealitySearchError(
      `Località non trovata su Sreality per «${city.trim()}». Prova «Brno» o un slug valido sreality.cz.`,
    );
  }

  throw new SrealitySearchError(
    `Sreality non ha risposto per ${city}. Verifica connessione o riprova più tardi.`,
  );
}

async function collectSrealityKindListings(
  city: string,
  operation: "sale" | "rent",
  kind: SrealitySearchKind,
  maxPages: number,
  byId: Map<string, MapListing>,
  onPage?: BatchFetchProgressCallback,
): Promise<void> {
  const opened = await openSrealityCitySearch(city, operation, kind);
  if (!opened) return;

  const { seo, region, firstPage } = opened;
  let prevPageIds: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const data =
      page === 1 ? firstPage : await fetchSrealityPage(seo, operation, page, kind, region);
    if (!data) break;
    const estates = data.results ?? [];
    if (!estates.length) break;

    const pageIds = estates.map((e) => String(e.id));
    if (page > 1 && pageIds.join(",") === prevPageIds.join(",")) break;
    prevPageIds = pageIds;

    for (const estate of estates) {
      const listing = mapEstate(estate, operation, kind);
      if (listing) byId.set(listing.id, listing);
    }

    onPage?.({
      operation,
      page,
      maxPages,
      listingsTotal: byId.size,
    });

    if (page >= maxPages) break;
  }
}

export async function fetchSrealityCityListings(
  city: string,
  operation: "sale" | "rent",
  market: MarketId = "cz",
  opts?: { maxPages?: number; onPage?: BatchFetchProgressCallback },
): Promise<CityListingsCache> {
  const cfg = getMarket(market);
  if (cfg.srealityRegionId == null) {
    throw new SrealitySearchError(`Sreality non supportato per ${city}`);
  }

  const maxPages = Math.max(1, opts?.maxPages ?? 3);
  const byId = new Map<string, MapListing>();
  const kinds: SrealitySearchKind[] =
    operation === "rent" ? ["byty", "pokoj"] : ["byty"];

  for (const kind of kinds) {
    await collectSrealityKindListings(
      city,
      operation,
      kind,
      maxPages,
      byId,
      opts?.onPage,
    );
  }

  const listings = await enrichSrealityListingsWithDates([...byId.values()]);
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

interface SrealityApiLocality {
  city_seo_name?: string | null;
  citypart_seo_name?: string | null;
  street_seo_name?: string | null;
}

interface SrealityApiCategory {
  name?: string | null;
}

interface SrealityApiEstateDetail {
  category_type_cb?: SrealityApiCategory | null;
  category_sub_cb?: SrealityApiCategory | null;
  locality?: SrealityApiLocality | null;
}

function srealityDetailUrlFromApiEstate(estateId: number, estate: SrealityApiEstateDetail): string | null {
  const operation = estate.category_type_cb?.name === "Pronájem" ? "pronajem" : "prodej";
  const rooms = encodeURIComponent(estate.category_sub_cb?.name ?? "byt").replace(/%2B/g, "+");
  const slug = [
    estate.locality?.city_seo_name,
    estate.locality?.citypart_seo_name,
    estate.locality?.street_seo_name,
  ]
    .filter(Boolean)
    .join("-");
  const locality = slug || "_";
  return `https://www.sreality.cz/detail/${operation}/byt/${rooms}/${locality}/${estateId}?noredirect=1`;
}

/** Resolve a browser-friendly detail URL (canonical slug + noredirect). */
export async function fetchSrealityListingDetailUrl(listingId: string): Promise<string | null> {
  const estateId = srealityEstateIdFromListingId(listingId);
  if (!estateId) return null;

  const response = await fetch(`https://www.sreality.cz/api/v1/estates/${estateId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      Referer: "https://www.sreality.cz/",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as { result?: SrealityApiEstateDetail };
  if (!payload.result) return null;

  const built = srealityDetailUrlFromApiEstate(estateId, payload.result);
  if (!built) return null;

  // Confirm the URL resolves (HEAD); if Sreality corrects the slug, keep noredirect=1.
  try {
    const probe = await fetch(built, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
        Referer: "https://www.sreality.cz/",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const loc = probe.headers.get("location");
    if (probe.status >= 300 && probe.status < 400 && loc) {
      const canonical = new URL(loc, "https://www.sreality.cz");
      canonical.searchParams.set("noredirect", "1");
      return canonical.toString();
    }
  } catch {
    /* keep built URL */
  }

  return built;
}

export async function fetchSrealityListingDetailUrls(listingIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const batchSize = 8;

  for (let i = 0; i < listingIds.length; i += batchSize) {
    const batch = listingIds.slice(i, i + batchSize);
    const resolved = await Promise.all(
      batch.map(async (id) => {
        try {
          const url = await fetchSrealityListingDetailUrl(id);
          return url ? ([id, url] as const) : null;
        } catch {
          return null;
        }
      }),
    );
    for (const entry of resolved) {
      if (entry) map.set(entry[0], entry[1]);
    }
  }

  return map;
}

