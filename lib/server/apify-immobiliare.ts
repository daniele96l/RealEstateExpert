import { ApifyClient } from "apify-client";
import { geocodeCity } from "@/lib/server/geocode";
import type { CityListingsCache, MapListing } from "@/lib/types";
import { OCCUPANCY_CITY, OCCUPANCY_MARKET } from "@/lib/occupancy/constants";
import type { ReggioRentalsFetchProgress } from "@/lib/server/reggio-rentals-fetch";

export class ApifyImmobiliareError extends Error {}

export const REGGIO_IMMOBILIARE_RENT_URL =
  "https://www.immobiliare.it/affitto-case/reggio-calabria/";

const DEFAULT_ACTORS = [
  "memo23/immobiliare-scraper",
  "crawlerbros/immobiliare-scraper",
  "loykos/immobiliare-listings",
] as const;

const MIN_DATE_COVERAGE = 0.2;
const LISTINGS_PER_PAGE = 25;
const ACTOR_WAIT_SECS = 600;

export interface ApifyImmobiliareResult {
  cache: CityListingsCache;
  actorId: string;
}

function apifyToken(): string {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    throw new ApifyImmobiliareError("APIFY_API_TOKEN is not set");
  }
  return token;
}

function actorChain(): string[] {
  const raw = process.env.APIFY_IMMOBILIARE_ACTORS?.trim();
  if (!raw) return [...DEFAULT_ACTORS];
  const actors = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!actors.length) return [...DEFAULT_ACTORS];
  return actors;
}

function isQuotaOrBillingError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err != null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes("insufficient") ||
    lower.includes("credit") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("payment") ||
    lower.includes("usage hard limit") ||
    lower.includes("platform limit") ||
    lower.includes("402") ||
    (lower.includes("403") && lower.includes("limit"))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseIntField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    return match ? Number.parseInt(match[0]!, 10) : null;
  }
  return null;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,]/g, "");
    if (!cleaned) return null;
    let normalized = cleaned;
    if (cleaned.includes(",") && cleaned.includes(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (cleaned.includes(",")) {
      normalized = cleaned.replace(",", ".");
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDateFromParts(year: number, month: number, day: number): string | null {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normalizeUnixTimestamp(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const ms = value > 1e12 ? value : value * 1000;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeDateString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const italian = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (italian) {
    return isoDateFromParts(Number(italian[3]), Number(italian[2]), Number(italian[1]));
  }
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function readDates(item: Record<string, unknown>): {
  listing_published_at: string | null;
  listing_updated_at: string | null;
} {
  const nested = asRecord(item.dates);
  const published =
    normalizeDateString(item.creationDateIso) ??
    normalizeDateString(item.creationDate) ??
    normalizeUnixTimestamp(item.creationDate) ??
    normalizeDateString(item.publishedAt) ??
    normalizeDateString(item.publicationDate) ??
    normalizeDateString(item.published_at) ??
    normalizeDateString(nested?.publication) ??
    normalizeDateString(nested?.publishedAt) ??
    normalizeDateString(nested?.creationDate);
  const updated =
    normalizeDateString(item.lastModifiedIso) ??
    normalizeDateString(item.lastModified) ??
    normalizeUnixTimestamp(item.lastModified) ??
    normalizeDateString(item.updatedAt) ??
    normalizeDateString(item.modificationDate) ??
    normalizeDateString(item.modifiedAt) ??
    normalizeDateString(nested?.modification) ??
    normalizeDateString(nested?.updatedAt) ??
    normalizeDateString(nested?.lastModified);
  return { listing_published_at: published, listing_updated_at: updated };
}

function listingIdFromItem(item: Record<string, unknown>): number | null {
  const id = item.id ?? item.listing_id ?? item.listingId;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number.parseInt(id, 10);
  const url = String(item.url ?? item.listingUrl ?? "");
  const match = url.match(/\/annunci\/(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function isBlockedSentinel(item: Record<string, unknown>): boolean {
  return item.type === "immobiliare_blocked";
}

function mapItemToListing(item: Record<string, unknown>): MapListing | null {
  if (isBlockedSentinel(item)) return null;

  const listingId = listingIdFromItem(item);
  const url = String(item.url ?? item.listingUrl ?? "").trim();
  const price =
    parsePrice(item.priceAmount) ??
    parsePrice(item.price) ??
    parsePrice(item.price_value) ??
    parsePrice(asRecord(item.price)?.value);
  if (!listingId || !url || !price) return null;

  const lat =
    typeof item.latitude === "number"
      ? item.latitude
      : typeof item.lat === "number"
        ? item.lat
        : 0;
  const lng =
    typeof item.longitude === "number"
      ? item.longitude
      : typeof item.lng === "number"
        ? item.lng
        : 0;
  const sqm =
    parseIntField(item.surfaceSqm) ??
    parseIntField(item.surface) ??
    parseIntField(asRecord(item.topology)?.surface);
  const rooms = parseIntField(item.rooms);
  const title = String(item.title ?? item.anchor ?? `Annuncio ${listingId}`).trim();
  const propertyType = String(
    item.propertyType ?? item.property_type ?? item.typology ?? "",
  ).trim();
  const dates = readDates(item);

  return {
    id: `im_${listingId}`,
    title: title || `Annuncio ${listingId}`,
    price,
    operation: "rent",
    url,
    lat,
    lng,
    sqm,
    rooms,
    address: String(item.address ?? item.title ?? title).trim() || null,
    property_type: propertyType || null,
    property_type_label: propertyType || null,
    condition_status: null,
    condition: null,
    needs_renovation: null,
    listing_published_at: dates.listing_published_at,
    listing_updated_at: dates.listing_updated_at,
  };
}

function mapItems(items: unknown[]): MapListing[] {
  return items
    .map((item) => mapItemToListing(asRecord(item) ?? {}))
    .filter((listing): listing is MapListing => listing != null);
}

function dateCoverage(listings: MapListing[]): number {
  if (!listings.length) return 0;
  return listings.filter((listing) => listing.listing_published_at).length / listings.length;
}

function actorInput(actorId: string, maxPages: number): Record<string, unknown> {
  const maxItems = Math.min(maxPages * LISTINGS_PER_PAGE, 1000);
  if (actorId === "memo23/immobiliare-scraper") {
    return {
      startUrls: [REGGIO_IMMOBILIARE_RENT_URL],
      proxyConfiguration: { useApifyProxy: true },
    };
  }
  if (actorId === "crawlerbros/immobiliare-scraper") {
    return {
      searchUrls: [REGGIO_IMMOBILIARE_RENT_URL],
      maxItems,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
        apifyProxyCountry: "IT",
      },
    };
  }
  if (actorId === "loykos/immobiliare-listings") {
    return {
      searchUrl: REGGIO_IMMOBILIARE_RENT_URL,
      maxPages,
      enrichData: true,
      removeWatermark: false,
    };
  }
  return {
    startUrl: REGGIO_IMMOBILIARE_RENT_URL,
    searchUrl: REGGIO_IMMOBILIARE_RENT_URL,
    searchUrls: [REGGIO_IMMOBILIARE_RENT_URL],
    startUrls: [REGGIO_IMMOBILIARE_RENT_URL],
    maxPages,
    maxItems,
    results_wanted: maxItems,
    enrichData: true,
    proxyConfiguration: { useApifyProxy: true },
  };
}

function isUsableResult(listings: MapListing[], items: unknown[]): boolean {
  if (!listings.length) return false;
  if (items.some((item) => isBlockedSentinel(asRecord(item) ?? {}))) return false;
  return dateCoverage(listings) >= MIN_DATE_COVERAGE || listings.length >= 5;
}

async function runActor(
  client: ApifyClient,
  actorId: string,
  maxPages: number,
): Promise<{ listings: MapListing[]; items: unknown[] }> {
  const run = await client.actor(actorId).call(actorInput(actorId, maxPages), {
    waitSecs: ACTOR_WAIT_SECS,
  });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const listings = mapItems(items);
  return { listings, items };
}

async function buildCache(listings: MapListing[]): Promise<CityListingsCache> {
  const centerData = await geocodeCity(OCCUPANCY_CITY, OCCUPANCY_MARKET);
  const withCoords = listings.filter((listing) => listing.lat !== 0 || listing.lng !== 0);
  const avgLat =
    withCoords.length > 0
      ? withCoords.reduce((sum, listing) => sum + listing.lat, 0) / withCoords.length
      : centerData.lat;
  const avgLng =
    withCoords.length > 0
      ? withCoords.reduce((sum, listing) => sum + listing.lng, 0) / withCoords.length
      : centerData.lng;

  return {
    city: "reggio_calabria",
    operation: "rent",
    fetched_at: new Date().toISOString(),
    center: {
      lat: centerData.lat || avgLat,
      lng: centerData.lng || avgLng,
      display_name: centerData.display_name ?? OCCUPANCY_CITY,
    },
    listings,
    provider: "apify_immobiliare",
  };
}

export async function fetchApifyImmobiliareListings(
  maxPages?: number,
  onProgress?: (progress: ReggioRentalsFetchProgress) => void,
): Promise<ApifyImmobiliareResult> {
  const pages = Math.min(maxPages ?? 10, 10);
  const client = new ApifyClient({ token: apifyToken() });
  const actors = actorChain();
  const errors: string[] = [];
  let bestPartial: { listings: MapListing[]; actorId: string } | null = null;

  for (let index = 0; index < actors.length; index += 1) {
    const actorId = actors[index]!;
    onProgress?.({
      page: index + 1,
      maxPages: actors.length,
      listingsTotal: bestPartial?.listings.length ?? 0,
      phase: "fetch",
    });

    try {
      const { listings, items } = await runActor(client, actorId, pages);
      if (isUsableResult(listings, items)) {
        process.stderr.write(
          `[apify-immobiliare] success via ${actorId} (${listings.length} listings, ${Math.round(dateCoverage(listings) * 100)}% with publish dates)\n`,
        );
        return { cache: await buildCache(listings), actorId };
      }

      if (listings.length && (!bestPartial || listings.length > bestPartial.listings.length)) {
        bestPartial = { listings, actorId };
      }
      errors.push(`${actorId}: insufficient data (${listings.length} listings)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${actorId}: ${message}`);
      if (isQuotaOrBillingError(err)) {
        process.stderr.write(
          `[apify-immobiliare] ${actorId} quota/billing limit — trying next actor\n`,
        );
        continue;
      }
      process.stderr.write(`[apify-immobiliare] ${actorId} failed: ${message}\n`);
    }
  }

  if (bestPartial?.listings.length) {
    process.stderr.write(
      `[apify-immobiliare] using partial result from ${bestPartial.actorId} (${bestPartial.listings.length} listings)\n`,
    );
    return { cache: await buildCache(bestPartial.listings), actorId: bestPartial.actorId };
  }

  throw new ApifyImmobiliareError(
    `All Apify actors failed: ${errors.join(" | ") || "no actors configured"}`,
  );
}

export function hasApifyToken(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

export function publishedDateRatio(listings: MapListing[]): number {
  return dateCoverage(listings);
}
