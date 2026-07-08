import type { MapListing, OccupancyBasicListing, OccupancyCityMetrics, TrackedRentalListing } from "@/lib/types";
import { fetchWithFallback } from "@/lib/server/listings-fetch";
import { getDefaultListingsProvider } from "@/lib/server/config";
import {
  OCCUPANCY_CITY,
  OCCUPANCY_FETCH_MAX_PAGES,
} from "./constants";
import { resolveListingZone } from "./zone";
import { emptyRegistry, loadRegistry, saveRegistry, saveSnapshot } from "./registry";
import { computeOccupancyMetrics } from "./metrics";

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function mapListingToBasic(listing: MapListing): OccupancyBasicListing {
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

function createTracked(basic: OccupancyBasicListing, at: string): TrackedRentalListing {
  return {
    ...basic,
    first_seen_at: at,
    last_seen_at: at,
    rented_at: null,
    status: "active",
    days_on_market: null,
    price_history: [{ at, price: basic.price }],
  };
}

function updateTrackedFields(
  tracked: TrackedRentalListing,
  basic: OccupancyBasicListing,
  at: string,
): TrackedRentalListing {
  const lastPrice = tracked.price_history[tracked.price_history.length - 1]?.price;
  const priceHistory =
    lastPrice !== basic.price
      ? [...tracked.price_history, { at, price: basic.price }]
      : tracked.price_history;

  return {
    ...tracked,
    price: basic.price,
    lat: basic.lat,
    lng: basic.lng,
    sqm: basic.sqm,
    rooms: basic.rooms,
    address: basic.address,
    zone: basic.zone,
    last_seen_at: at,
    price_history: priceHistory,
  };
}

function markRented(tracked: TrackedRentalListing): TrackedRentalListing {
  const rentedAt = tracked.last_seen_at;
  return {
    ...tracked,
    status: "presumed_rented",
    rented_at: rentedAt,
    days_on_market: daysBetween(tracked.first_seen_at, rentedAt),
  };
}

export interface OccupancySnapshotResult {
  registry: Awaited<ReturnType<typeof loadRegistry>>;
  metrics: OccupancyCityMetrics;
  fetched_count: number;
  new_count: number;
  rented_count: number;
}

export async function runOccupancySnapshot(): Promise<OccupancySnapshotResult> {
  const { data } = await fetchWithFallback(
    OCCUPANCY_CITY,
    "rent",
    getDefaultListingsProvider(),
    OCCUPANCY_FETCH_MAX_PAGES,
  );

  const fetchedAt = data.fetched_at || new Date().toISOString();
  const basics = data.listings.map(mapListingToBasic);
  const currentIds = new Set(basics.map((l) => l.id));
  const basicsById = new Map(basics.map((l) => [l.id, l]));

  const registry = await loadRegistry();
  const listings = { ...registry.listings };

  let newCount = 0;
  let rentedCount = 0;

  for (const basic of basics) {
    const existing = listings[basic.id];
    if (!existing) {
      listings[basic.id] = createTracked(basic, fetchedAt);
      newCount++;
      continue;
    }

    if (existing.status === "presumed_rented") {
      listings[basic.id] = createTracked(basic, fetchedAt);
      newCount++;
      continue;
    }

    listings[basic.id] = updateTrackedFields(existing, basic, fetchedAt);
  }

  for (const [id, tracked] of Object.entries(listings)) {
    if (tracked.status !== "active") continue;
    if (currentIds.has(id)) continue;
    listings[id] = markRented(tracked);
    rentedCount++;
  }

  const updatedRegistry = {
    ...(registry.snapshot_count ? registry : emptyRegistry()),
    updated_at: fetchedAt,
    snapshot_count: registry.snapshot_count + 1,
    listings,
  };

  await saveSnapshot({
    fetched_at: fetchedAt,
    active_count: basics.length,
    listings: basics,
  });
  await saveRegistry(updatedRegistry);

  const metrics = await computeOccupancyMetrics(updatedRegistry);

  return {
    registry: updatedRegistry,
    metrics,
    fetched_count: basics.length,
    new_count: newCount,
    rented_count: rentedCount,
  };
}
