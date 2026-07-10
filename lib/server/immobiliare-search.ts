import type { CityListingsCache, MapListing } from "@/lib/types";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { geocodeCity, normalizeCitySlug, citySlugVariants } from "./geocode";
import { resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { withImmobiliareBrowser } from "./immobiliare-browser";
import { extractNextData, mapRealEstateToDetail } from "./immobiliare-scraper";

export class ImmobiliareSearchError extends Error {}

type Operation = "sale" | "rent";

export interface ImmobiliareLocation {
  idComune: string;
  idProvincia: string;
  fkRegione: string;
  citySlug: string;
  label: string;
  center: { lat: number; lng: number };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function operationPath(operation: Operation): string {
  return operation === "rent" ? "affitto-case" : "vendita-case";
}

function contractId(operation: Operation): string {
  return operation === "rent" ? "2" : "1";
}

export async function resolveImmobiliareLocation(city: string): Promise<ImmobiliareLocation> {
  const response = await fetch(
    `https://www.immobiliare.it/api-next/geography/autocomplete/?query=${encodeURIComponent(city)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new ImmobiliareSearchError(`Autocomplete Immobiliare fallito (${response.status})`);
  }
  const items = (await response.json()) as Array<Record<string, unknown>>;
  if (!items.length) throw new ImmobiliareSearchError(`Città non trovata su Immobiliare: ${city}`);

  const comune = items.find((item) => item.type === 2) ?? items[0];
  const parents = Array.isArray(comune.parents) ? comune.parents : [];
  const region = parents.find((p) => asRecord(p)?.type === 0) as Record<string, unknown> | undefined;
  const province = parents.find((p) => asRecord(p)?.type === 1) as Record<string, unknown> | undefined;
  const centerObj = asRecord(comune.center);
  const keyurl = String(comune.keyurl ?? "");
  const citySlug = citySlugVariants(city).find((s) => s.includes("-")) ?? keyurl.replace(/_/g, "-").toLowerCase();

  return {
    idComune: String(comune.id ?? ""),
    idProvincia: String(province?.id ?? ""),
    fkRegione: String(region?.id ?? ""),
    citySlug,
    label: String(comune.label ?? city),
    center: {
      lat: Number(centerObj?.lat ?? 0),
      lng: Number(centerObj?.lng ?? 0),
    },
  };
}

export function buildImmobiliareSearchUrl(location: ImmobiliareLocation, operation: Operation, page = 1): string {
  const path = `/${operationPath(operation)}/${location.citySlug}/`;
  const pag = page > 1 ? `?pag=${page}` : "";
  return `https://www.immobiliare.it${path}${pag}`;
}

export function buildSearchApiUrl(location: ImmobiliareLocation, operation: Operation, page: number): string {
  const path = `/${operationPath(operation)}/${location.citySlug}/`;
  const params = new URLSearchParams({
    fkRegione: location.fkRegione,
    idProvincia: location.idProvincia,
    idComune: location.idComune,
    idNazione: "IT",
    idContratto: contractId(operation),
    idCategoria: "1",
    criterio: "dataModifica",
    ordine: "desc",
    __lang: "it",
    pag: String(page),
    paramsCount: "5",
    path,
  });
  return `https://www.immobiliare.it/api-next/search-list/real-estates/?${params}`;
}

function findSearchResults(data: unknown): Array<Record<string, unknown>> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findSearchResults(item);
      if (found?.length) return found;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.results) && obj.results.length > 0) {
    const first = asRecord(obj.results[0]);
    if (first && (first.realEstate != null || asRecord(first.realEstate))) {
      return obj.results as Array<Record<string, unknown>>;
    }
  }

  for (const value of Object.values(obj)) {
    const found = findSearchResults(value);
    if (found?.length) return found;
  }
  return null;
}

function listingUrlFromResult(result: Record<string, unknown>, numericId: string): string {
  const seo = asRecord(result.seo);
  const url = seo?.url;
  if (typeof url === "string" && url.includes("immobiliare.it")) {
    return url.startsWith("http") ? url : `https://www.immobiliare.it${url}`;
  }
  return `https://www.immobiliare.it/annunci/${numericId}/`;
}

export function mapSearchResultToListing(
  result: Record<string, unknown>,
  operation: Operation,
): MapListing {
  const re = asRecord(result.realEstate) ?? result;
  const numericId = String(re.id ?? "");
  const url = listingUrlFromResult(result, numericId);
  const detail = mapRealEstateToDetail(re, url, numericId);
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
    listing_published_at: detail.listing_published_at ?? null,
    listing_updated_at: detail.listing_updated_at ?? null,
  };
}

function parseSearchPayload(payload: unknown, operation: Operation): {
  listings: MapListing[];
  currentPage: number;
  maxPages: number;
} {
  const root = asRecord(payload);
  const results = findSearchResults(payload) ?? [];
  const listings = results
    .map((result) => {
      try {
        return mapSearchResultToListing(result, operation);
      } catch {
        return null;
      }
    })
    .filter((listing): listing is MapListing => listing != null && listing.price > 0);

  const currentPage = Number(root?.currentPage ?? 1);
  const maxPages = Number(root?.maxPages ?? 1);

  return { listings, currentPage, maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 1 };
}

function parseSearchHtml(html: string, operation: Operation): {
  listings: MapListing[];
  currentPage: number;
  maxPages: number;
} {
  const nextData = extractNextData(html);
  if (!nextData) {
    throw new ImmobiliareSearchError("Dati ricerca non trovati nella pagina Immobiliare");
  }
  return parseSearchPayload(nextData, operation);
}

async function fetchSearchPageNative(
  location: ImmobiliareLocation,
  operation: Operation,
  page: number,
): Promise<{ listings: MapListing[]; currentPage: number; maxPages: number }> {
  const response = await fetch(buildSearchApiUrl(location, operation, page), {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "it-IT,it;q=0.9",
      Referer: buildImmobiliareSearchUrl(location, operation, page),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new ImmobiliareSearchError(`API Immobiliare nativa fallita (${response.status})`);
  }
  const payload = await response.json();
  const root = asRecord(payload);
  if (root?.error) throw new ImmobiliareSearchError(String(root.error));
  const parsed = parseSearchPayload(payload, operation);
  if (!parsed.listings.length) {
    throw new ImmobiliareSearchError("API Immobiliare nativa senza risultati");
  }
  return parsed;
}

async function fetchImmobiliareViaNativeApi(
  city: string,
  operation: Operation,
  opts?: { maxPages?: number; onPage?: BatchFetchProgressCallback },
): Promise<CityListingsCache> {
  const maxPages = resolveItalyListingMaxPages(opts?.maxPages);
  const location = await resolveImmobiliareLocation(city);
  const geo = await geocodeCity(city);
  const all: MapListing[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const result = await fetchSearchPageNative(location, operation, page);
    all.push(...result.listings);
    totalPages = result.maxPages;
    opts?.onPage?.({
      operation,
      page,
      maxPages,
      listingsTotal: all.length,
    });
    if (!result.listings.length) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 400));
  }

  const byId = new Map<string, MapListing>();
  for (const listing of all) byId.set(listing.id, listing);
  if (!byId.size) throw new ImmobiliareSearchError(`Nessun annuncio Immobiliare per ${city}`);

  return {
    city: normalizeCitySlug(city),
    operation,
    fetched_at: new Date().toISOString(),
    center: {
      lat: location.center.lat || geo.lat,
      lng: location.center.lng || geo.lng,
      display_name: geo.display_name ?? location.label,
    },
    listings: [...byId.values()],
    provider: "direct",
  };
}

async function fetchSearchPage(
  fetchHtml: (url: string) => Promise<string>,
  fetchJson: (url: string) => Promise<unknown>,
  location: ImmobiliareLocation,
  operation: Operation,
  page: number,
): Promise<{ listings: MapListing[]; currentPage: number; maxPages: number }> {
  try {
    const payload = await fetchJson(buildSearchApiUrl(location, operation, page));
    const root = asRecord(payload);
    if (root?.error) {
      throw new ImmobiliareSearchError(String(root.error));
    }
    const parsed = parseSearchPayload(payload, operation);
    if (parsed.listings.length > 0) return parsed;
    throw new ImmobiliareSearchError("API ricerca senza risultati");
  } catch {
    const html = await fetchHtml(buildImmobiliareSearchUrl(location, operation, page));
    return parseSearchHtml(html, operation);
  }
}

export async function fetchImmobiliareCityListings(
  city: string,
  operation: Operation,
  opts?: { maxPages?: number; onPage?: BatchFetchProgressCallback },
): Promise<CityListingsCache> {
  const maxPages = resolveItalyListingMaxPages(opts?.maxPages);
  const pageOpts = { ...opts, maxPages };

  try {
    return await fetchImmobiliareViaNativeApi(city, operation, pageOpts);
  } catch {
    /* fall through to Playwright */
  }

  const location = await resolveImmobiliareLocation(city);
  const geo = await geocodeCity(city);

  return withImmobiliareBrowser(async ({ fetchHtml, fetchJson }) => {
    const all: MapListing[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= maxPages) {
      const result = await fetchSearchPage(fetchHtml, fetchJson, location, operation, page);
      all.push(...result.listings);
      totalPages = result.maxPages;
      opts?.onPage?.({
        operation,
        page,
        maxPages,
        listingsTotal: all.length,
      });
      if (result.listings.length === 0) break;
      page += 1;
      await new Promise((r) => setTimeout(r, 800));
    }

    const byId = new Map<string, MapListing>();
    for (const listing of all) byId.set(listing.id, listing);

    return {
      city: normalizeCitySlug(city),
      operation,
      fetched_at: new Date().toISOString(),
      center: {
        lat: location.center.lat || geo.lat,
        lng: location.center.lng || geo.lng,
        display_name: geo.display_name ?? location.label,
      },
      listings: [...byId.values()],
      provider: "direct",
    };
  });
}
