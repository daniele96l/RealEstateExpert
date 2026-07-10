import { inferListingWebsiteSource } from "@/lib/listing-url";
import { resolvePropertyCondition } from "@/lib/property-condition";
import type { ListingDetail, MapListing } from "@/lib/types";
import { extractSrealityListingDates } from "./sreality-dates";
import { listingToDetail, normalizeEnergyClass } from "./property-detail";

export class SrealityDetailError extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface SrealityNamedValue {
  name?: string;
  value?: number;
}

interface SrealityEstateParams {
  usableArea?: number | null;
  floorNumber?: number | null;
  since?: string | null;
  edited?: string | null;
  elevator?: SrealityNamedValue | null;
  terrace?: boolean | null;
  balcony?: boolean | null;
  garage?: boolean | null;
  furnished?: SrealityNamedValue | null;
  buildingCondition?: SrealityNamedValue | null;
  energyEfficiencyRating?: SrealityNamedValue | null;
  energyPerformanceSummary?: number | null;
  acceptanceYear?: number | null;
  reconstructionYear?: number | null;
}

interface SrealityEstateImage {
  url?: string;
}

interface SrealityEstateLocality {
  latitude?: number;
  longitude?: number;
  city?: string;
  cityPart?: string;
  street?: string;
  streetNumber?: string;
  houseNumber?: string;
  zip?: number;
}

interface SrealityEstateDetail {
  id?: number;
  name?: string;
  description?: string | null;
  priceCzk?: number | null;
  priceSummaryCzk?: number | null;
  images?: SrealityEstateImage[];
  locality?: SrealityEstateLocality;
  params?: SrealityEstateParams;
  categorySubCb?: SrealityNamedValue;
}

interface NextData {
  props?: {
    pageProps?: {
      dehydratedState?: {
        queries?: Array<{
          queryKey?: unknown[];
          state?: { data?: SrealityEstateDetail };
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

function operationFromUrl(url: string): "sale" | "rent" {
  return /\/pronajem\//i.test(url) ? "rent" : "sale";
}

function extractEstateFromHtml(html: string): SrealityEstateDetail {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new SrealityDetailError("Pagina Sreality senza dati annuncio (__NEXT_DATA__ mancante).");
  }

  let data: NextData;
  try {
    data = JSON.parse(match[1]) as NextData;
  } catch {
    throw new SrealityDetailError("Risposta Sreality non valida (JSON corrotto).");
  }

  const queries = data.props?.pageProps?.dehydratedState?.queries ?? [];
  for (const query of queries) {
    if (query.queryKey?.[0] === "estate" && query.state?.data) {
      return query.state.data;
    }
  }

  throw new SrealityDetailError("Dettaglio annuncio Sreality non trovato nella pagina.");
}

function normalizeImageUrl(raw: string): string {
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http")) return raw;
  return raw;
}

function energyFromSreality(rating?: SrealityNamedValue | null): ReturnType<typeof normalizeEnergyClass> {
  const name = rating?.name?.trim();
  if (!name) return null;
  const letter = name.match(/^([A-G]\d?)/i)?.[1]?.toUpperCase();
  return normalizeEnergyClass(letter ?? name);
}

function estateAddress(locality: SrealityEstateLocality | undefined): string | null {
  if (!locality) return null;
  const street = [locality.street, locality.streetNumber || locality.houseNumber].filter(Boolean).join(" ");
  const parts = [street, locality.cityPart, locality.city].filter(Boolean);
  return parts.length ? parts.join(", ") : locality.city ?? null;
}

function srealityListingId(estateId: number | undefined, base?: MapListing, url?: string): string {
  if (base?.id?.startsWith("sr_")) return base.id;
  if (estateId != null) return `sr_${estateId}`;
  const m = url?.match(/\/(\d+)\/?(?:\?|$)/);
  if (m) return `sr_${m[1]}`;
  return base?.id ?? "";
}

export function parseSrealityEstateDetail(
  estate: SrealityEstateDetail,
  sourceUrl: string,
  base?: MapListing,
): ListingDetail {
  const name = estate.name ?? base?.title ?? "Byt";
  const operation = base?.operation ?? operationFromUrl(sourceUrl);
  const price =
    estate.priceCzk ??
    estate.priceSummaryCzk ??
    base?.price ??
    0;
  const sqm = estate.params?.usableArea ?? base?.sqm ?? parseSqmFromName(name);
  const rooms = base?.rooms ?? parseRoomsFromName(name);
  const lat = estate.locality?.latitude ?? base?.lat ?? 0;
  const lng = estate.locality?.longitude ?? base?.lng ?? 0;
  const description = estate.description?.trim() || null;
  const conditionStatus = estate.params?.buildingCondition?.name ?? null;
  const conditionInfo = resolvePropertyCondition(conditionStatus, description);
  const images = (estate.images ?? [])
    .map((img) => (img.url ? normalizeImageUrl(img.url) : null))
    .filter((u): u is string => Boolean(u))
    .slice(0, 12);
  const { listing_published_at, listing_updated_at } = extractSrealityListingDates(estate.params);

  const listing: MapListing = {
    id: srealityListingId(estate.id, base, sourceUrl),
    title: name,
    price: Number(price) || base?.price || 0,
    operation,
    url: sourceUrl,
    lat: Number(lat),
    lng: Number(lng),
    sqm,
    rooms,
    address: estateAddress(estate.locality) ?? base?.address ?? null,
    property_type: base?.property_type ?? "flat",
    property_type_label: base?.property_type_label ?? estate.categorySubCb?.name ?? "Byt",
    condition_status: conditionInfo.condition_status ?? conditionStatus,
    condition: conditionInfo.condition ?? base?.condition ?? null,
    needs_renovation: conditionInfo.needs_renovation ?? base?.needs_renovation ?? null,
    listing_published_at: listing_published_at ?? base?.listing_published_at ?? null,
    listing_updated_at: listing_updated_at ?? base?.listing_updated_at ?? null,
  };

  const builtYear =
    estate.params?.reconstructionYear ??
    estate.params?.acceptanceYear ??
    null;

  return {
    ...listing,
    bathrooms: null,
    floor: estate.params?.floorNumber != null ? String(estate.params.floorNumber) : null,
    energy_class: energyFromSreality(estate.params?.energyEfficiencyRating),
    energy_kwh_sqm: estate.params?.energyPerformanceSummary ?? null,
    condition: conditionInfo.condition,
    condition_status: conditionInfo.condition_status ?? conditionStatus,
    needs_renovation: conditionInfo.needs_renovation,
    property_type: listing.property_type,
    property_type_label: listing.property_type_label,
    zone: estate.locality?.cityPart ?? null,
    city_label: estate.locality?.city ?? null,
    price_per_sqm: sqm ? Math.round(listing.price / sqm) : null,
    condominio_monthly: null,
    lift: estate.params?.elevator?.value === 1 ? true : estate.params?.elevator?.value === 2 ? false : null,
    garden: null,
    terrace: estate.params?.terrace || estate.params?.balcony ? true : null,
    garage: estate.params?.garage ? true : null,
    furnished: estate.params?.furnished?.name ?? null,
    built_year: builtYear,
    description,
    images,
    fetched_at: new Date().toISOString(),
  };
}

export async function fetchSrealityPropertyDetail(
  url: string,
  base?: MapListing,
): Promise<ListingDetail> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new SrealityDetailError(
      `Sreality error ${response.status}. Verifica connessione o riprova più tardi.`,
    );
  }

  const html = await response.text();
  const estate = extractEstateFromHtml(html);
  return parseSrealityEstateDetail(estate, url, base);
}

export function isSrealityListing(listing: { id: string; url: string }): boolean {
  return inferListingWebsiteSource(listing) === "sreality";
}

export async function fetchPropertyDetailForSrealityListing(
  listing: MapListing,
): Promise<ListingDetail> {
  const url = listing.url?.trim();
  if (!url) throw new SrealityDetailError("URL annuncio Sreality mancante");
  try {
    return await fetchSrealityPropertyDetail(url, listing);
  } catch (err) {
    if (listing.id) return listingToDetail(listing);
    throw err;
  }
}
