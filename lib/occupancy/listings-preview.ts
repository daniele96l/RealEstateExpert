import path from "path";
import type {
  CityListingsCache,
  MapListing,
  OccupancyBasicListing,
  OccupancyListingsPreview,
} from "@/lib/types";
import { getCache, mergeListings } from "@/lib/server/listings-cache";
import { readJsonFile } from "@/lib/server/fs-cache-io";
import { OCCUPANCY_CITY, OCCUPANCY_MARKET } from "./constants";
import { resolveListingZone } from "./zone";

const PREVIEW_SAMPLE_SIZE = 8;
const PREVIEW_AREA_LIMIT = 8;

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

function toBasic(listing: MapListing): OccupancyBasicListing {
  return {
    id: listing.id,
    price: listing.price,
    lat: listing.lat,
    lng: listing.lng,
    sqm: listing.sqm,
    rooms: listing.rooms,
    address: listing.address,
    zone: resolveListingZone(listing.address),
  };
}

function shortenAddress(address: string | null): string {
  if (!address?.trim()) return "—";
  const trimmed = address.trim();
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69)}…`;
}

async function loadMergedRentCache(): Promise<CityListingsCache | null> {
  const primary = await getCache(OCCUPANCY_MARKET, OCCUPANCY_CITY, "rent");
  const alt = await readJsonFile<CityListingsCache>(
    path.join(process.cwd(), "data", "listings", "reggio_di_calabria_rent.json"),
  );

  if (!primary && !alt) return null;
  if (!primary) return alt;
  if (!alt) return primary;

  const mergedListings = mergeListings(primary.listings, alt.listings);
  const fetchedAt =
    new Date(primary.fetched_at).getTime() >= new Date(alt.fetched_at).getTime()
      ? primary.fetched_at
      : alt.fetched_at;

  return {
    ...primary,
    listings: mergedListings,
    fetched_at: fetchedAt,
    provider: primary.provider ?? alt.provider,
  };
}

export async function loadListingsPreview(): Promise<OccupancyListingsPreview | null> {
  const cache = await loadMergedRentCache();
  if (!cache?.listings.length) return null;

  const basics = cache.listings.map(toBasic);
  const prices = basics.map((l) => l.price).filter((p) => p > 0);
  const sqms = basics.map((l) => l.sqm).filter((s): s is number => s != null && s > 0);

  const byZone = new Map<string, MapListing[]>();
  for (const listing of cache.listings) {
    const zone = resolveListingZone(listing.address);
    const bucket = byZone.get(zone) ?? [];
    bucket.push(listing);
    byZone.set(zone, bucket);
  }

  const areas = [...byZone.entries()]
    .map(([zone, items]) => ({
      zone,
      count: items.length,
      avg_price: average(items.map((l) => l.price).filter((p) => p > 0)),
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
    areas,
    sample,
  };
}
