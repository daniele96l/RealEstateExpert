import path from "path";
import type {
  CityListingsCache,
  MapListing,
  OccupancyBasicListing,
  OccupancyListingsPreview,
  OccupancySnapshot,
} from "@/lib/types";
import { getCache, mergeListings } from "@/lib/server/listings-cache";
import { readJsonFile } from "@/lib/server/fs-cache-io";
import { inferListingWebsiteSource } from "@/lib/listing-url";
import { DEFAULT_OCCUPANCY_PORTAL, type OccupancyPortal } from "./constants";
import {
  defaultOccupancyCitySlug,
  getOccupancyCityConfig,
  type OccupancyCitySlug,
} from "./cities";
import { remapListingZones, resolveListingZone, withResolvedZone } from "./zone";

const PREVIEW_SAMPLE_SIZE = 8;
const PREVIEW_AREA_LIMIT = 20;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function pricePerSqmValues(listings: Array<{ price: number; sqm: number | null }>): number[] {
  return listings
    .filter((l) => l.price > 0 && l.sqm != null && l.sqm > 0)
    .map((l) => l.price / l.sqm!);
}

function avgPricePerSqm(listings: Array<{ price: number; sqm: number | null }>): number | null {
  return average(pricePerSqmValues(listings));
}

function medianPricePerSqm(listings: Array<{ price: number; sqm: number | null }>): number | null {
  return median(pricePerSqmValues(listings));
}

function toBasic(listing: MapListing, citySlug: OccupancyCitySlug): OccupancyBasicListing {
  return {
    id: listing.id,
    price: listing.price,
    lat: listing.lat,
    lng: listing.lng,
    sqm: listing.sqm,
    rooms: listing.rooms,
    property_type: listing.property_type ?? null,
    address: listing.address,
    zone: resolveListingZone(listing.address, listing.lat, listing.lng, citySlug),
    url: listing.url,
    listing_published_at: listing.listing_published_at ?? null,
    listing_updated_at: listing.listing_updated_at ?? null,
  };
}

function shortenAddress(address: string | null): string {
  if (!address?.trim()) return "—";
  const trimmed = address.trim();
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69)}…`;
}

function listingSourceForPortal(portal: OccupancyPortal): string | null {
  if (portal === "idealista_scraper") return "idealista";
  if (portal === "immobiliare_scraper") return "immobiliare";
  if (portal === "casa_scraper") return "casa";
  if (portal === "subito_scraper") return "subito";
  if (portal === "sreality") return "sreality";
  return null;
}

export async function listingUrlMapFromRentCache(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<Map<string, string>> {
  const cache = await loadMergedRentCache(citySlug, portal);
  const map = new Map<string, string>();
  for (const listing of cache?.listings ?? []) {
    const url = listing.url?.trim();
    if (url) map.set(listing.id, url);
  }
  return map;
}

async function loadMergedRentCache(
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
): Promise<CityListingsCache | null> {
  const { city, market } = getOccupancyCityConfig(citySlug);
  const primary = await getCache(market, city, "rent");

  if (citySlug === "brno") {
    if (!primary?.listings.length) return null;
    const listings = primary.listings.filter((listing) => inferListingWebsiteSource(listing) === "sreality");
    if (!listings.length) return null;
    return { ...primary, listings };
  }

  const alt = await readJsonFile<CityListingsCache>(
    path.join(process.cwd(), "data", "listings", "reggio_di_calabria_rent.json"),
  );

  if (!primary && !alt) return null;
  const merged = !primary
    ? alt
    : !alt
      ? primary
      : {
          ...primary,
          listings: mergeListings(primary.listings, alt.listings),
          fetched_at:
            new Date(primary.fetched_at).getTime() >= new Date(alt.fetched_at).getTime()
              ? primary.fetched_at
              : alt.fetched_at,
          provider: primary.provider ?? alt.provider,
        };

  if (!merged?.listings.length) return null;

  const listings = merged.listings.filter((listing) => {
    const source = inferListingWebsiteSource(listing);
    const expected = listingSourceForPortal(portal);
    return expected ? source === expected : false;
  });

  if (!listings.length) return null;

  return {
    ...merged,
    listings,
  };
}

export async function loadListingsPreview(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancyListingsPreview | null> {
  const cache = await loadMergedRentCache(citySlug, portal);
  if (!cache?.listings.length) return null;

  const basics = remapListingZones(cache.listings.map((listing) => toBasic(listing, citySlug)), citySlug);
  const prices = basics.map((l) => l.price).filter((p) => p > 0);
  const sqms = basics.map((l) => l.sqm).filter((s): s is number => s != null && s > 0);

  const byZone = new Map<string, MapListing[]>();
  for (const listing of cache.listings) {
    const zone = resolveListingZone(listing.address, listing.lat, listing.lng, citySlug);
    const bucket = byZone.get(zone) ?? [];
    bucket.push(listing);
    byZone.set(zone, bucket);
  }

  const areas = [...byZone.entries()]
    .map(([zone, items]) => ({
      zone,
      count: items.length,
      avg_price: average(items.map((l) => l.price).filter((p) => p > 0)),
      avg_price_per_sqm: avgPricePerSqm(items),
    }))
    .sort((a, b) => b.count - a.count || a.zone.localeCompare(b.zone, "it"))
    .slice(0, PREVIEW_AREA_LIMIT);

  const sample = [...basics]
    .sort((a, b) => b.price - a.price)
    .slice(0, PREVIEW_SAMPLE_SIZE)
    .map((item) => ({
      ...item,
      address: shortenAddress(item.address),
    }));

  return {
    source: "listings_cache",
    fetched_at: cache.fetched_at,
    provider: cache.provider ?? null,
    listing_count: basics.length,
    avg_price: average(prices),
    median_price: median(prices),
    avg_sqm: average(sqms),
    avg_price_per_sqm: avgPricePerSqm(basics),
    median_price_per_sqm: medianPricePerSqm(basics),
    areas,
    sample,
  };
}

export function buildPreviewFromSnapshot(
  snapshot: OccupancySnapshot,
  provider: string | null = null,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
): OccupancyListingsPreview {
  const basics = remapListingZones(snapshot.listings, citySlug);
  const prices = basics.map((l) => l.price).filter((p) => p > 0);
  const sqms = basics.map((l) => l.sqm).filter((s): s is number => s != null && s > 0);

  const byZone = new Map<string, OccupancyBasicListing[]>();
  for (const listing of basics) {
    const zone = listing.zone ?? "Altro";
    const bucket = byZone.get(zone) ?? [];
    bucket.push(listing);
    byZone.set(zone, bucket);
  }

  const areas = [...byZone.entries()]
    .map(([zone, items]) => ({
      zone,
      count: items.length,
      avg_price: average(items.map((l) => l.price).filter((p) => p > 0)),
      avg_price_per_sqm: avgPricePerSqm(items),
    }))
    .sort((a, b) => b.count - a.count || a.zone.localeCompare(b.zone, "it"))
    .slice(0, PREVIEW_AREA_LIMIT);

  const sample = [...basics]
    .sort((a, b) => b.price - a.price)
    .slice(0, PREVIEW_SAMPLE_SIZE)
    .map((item) => ({
      ...item,
      address: shortenAddress(item.address),
    }));

  return {
    source: "occupancy_snapshot",
    fetched_at: snapshot.fetched_at,
    provider,
    listing_count: basics.length,
    avg_price: average(prices),
    median_price: median(prices),
    avg_sqm: average(sqms),
    avg_price_per_sqm: avgPricePerSqm(basics),
    median_price_per_sqm: medianPricePerSqm(basics),
    areas,
    sample,
  };
}

export async function resolveListingsPreview(
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
  snapshots: OccupancySnapshot[],
  provider: string | null = null,
): Promise<OccupancyListingsPreview | null> {
  const fromCache = await loadListingsPreview(citySlug, portal);
  if (fromCache) return fromCache;

  const latest = snapshots[snapshots.length - 1];
  if (latest?.listings.length) {
    return buildPreviewFromSnapshot(latest, provider, citySlug);
  }

  return null;
}
