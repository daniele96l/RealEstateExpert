import type {
  CityListingsCache,
  ListingsProvider,
  MapListing,
  OccupancyBasicListing,
  OccupancyCityMetrics,
  OccupancyRegistry,
  OccupancySnapshot,
  TrackedRentalListing,
} from "@/lib/types";
import { fetchItalyListingsWithFallback } from "@/lib/server/italy-listings-fetch";
import { fetchReggioRentalsListings } from "@/lib/server/reggio-rentals-fetch";
import { fetchBrnoRentalsListings } from "@/lib/server/brno-rentals-fetch";
import { getDefaultListingsProvider } from "@/lib/server/config";
import {
  DEFAULT_OCCUPANCY_PORTAL,
  OCCUPANCY_FETCH_MAX_PAGES,
  type OccupancyPortal,
} from "./constants";
import {
  defaultOccupancyCitySlug,
  getOccupancyCityConfig,
  type OccupancyCitySlug,
} from "./cities";
import { resolveBatchFetchPageLimit, resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import type { OccupancySnapshotProgressState } from "@/lib/occupancy-snapshot-progress";
import { resolveListingZone } from "./zone";
import { emptyRegistry, loadRegistry, saveRegistry, saveSnapshot } from "./registry";
import { computeOccupancyMetrics } from "./metrics";
import { DEFAULT_OCCUPANCY_METRICS_PERIOD } from "./metrics-period";
import { logPresumedRentalRemoval } from "./removal-log";

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function mapListingToBasic(listing: MapListing, citySlug: OccupancyCitySlug): OccupancyBasicListing {
  return {
    id: listing.id,
    price: listing.price,
    lat: listing.lat,
    lng: listing.lng,
    sqm: listing.sqm,
    rooms: listing.rooms,
    address: listing.address,
    zone: resolveListingZone(listing.address, listing.lat, listing.lng, citySlug),
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

function markRented(tracked: TrackedRentalListing, removedAt: string): TrackedRentalListing {
  return {
    ...tracked,
    status: "presumed_rented",
    rented_at: removedAt,
    days_on_market: daysBetween(tracked.first_seen_at, removedAt),
  };
}

export interface OccupancySnapshotResult {
  registry: Awaited<ReturnType<typeof loadRegistry>>;
  metrics: OccupancyCityMetrics;
  fetched_count: number;
  new_count: number;
  rented_count: number;
}

export function rebuildRegistryFromSnapshots(
  snapshots: OccupancySnapshot[],
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  lastProvider: ListingsProvider | null = null,
): OccupancyRegistry {
  const { city, market } = getOccupancyCityConfig(citySlug);
  const listings: Record<string, TrackedRentalListing> = {};

  for (const snapshot of snapshots) {
    const fetchedAt = snapshot.fetched_at;
    const currentIds = new Set(snapshot.listings.map((l) => l.id));

    for (const basic of snapshot.listings) {
      const existing = listings[basic.id];
      if (!existing) {
        listings[basic.id] = createTracked(basic, fetchedAt);
        continue;
      }
      if (existing.status === "presumed_rented") {
        listings[basic.id] = createTracked(basic, fetchedAt);
        continue;
      }
      listings[basic.id] = updateTrackedFields(existing, basic, fetchedAt);
    }

    for (const [id, tracked] of Object.entries(listings)) {
      if (tracked.status !== "active") continue;
      if (currentIds.has(id)) continue;
      listings[id] = markRented(tracked, fetchedAt);
    }
  }

  const last = snapshots[snapshots.length - 1];
  return {
    city,
    market,
    portal,
    updated_at: last?.fetched_at ?? new Date().toISOString(),
    snapshot_count: snapshots.length,
    last_provider: lastProvider,
    listings,
  };
}

export async function rebuildRegistryUpTo(
  targetFetchedAt: string,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  lastProvider: ListingsProvider | null = null,
): Promise<OccupancyRegistry | null> {
  const { loadAllSnapshots } = await import("./registry");
  const targetMs = new Date(targetFetchedAt).getTime();
  if (!Number.isFinite(targetMs)) return null;

  const snapshots = (await loadAllSnapshots(citySlug, portal)).filter(
    (s) => new Date(s.fetched_at).getTime() <= targetMs,
  );
  if (!snapshots.length) return null;
  return rebuildRegistryFromSnapshots(snapshots, citySlug, portal, lastProvider);
}

export interface OccupancySnapshotOptions {
  citySlug?: OccupancyCitySlug;
  /** Skip fetch when data was already scraped (e.g. prod sync script). */
  prefetched?: CityListingsCache;
  provider?: ListingsProvider;
}

async function fetchOccupancyListings(
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
  maxPages: number,
  reportProgress: (current: number, page: number, listingsTotal: number, label: string) => void,
  options?: OccupancySnapshotOptions,
): Promise<{ data: CityListingsCache; provider: ListingsProvider }> {
  const cityConfig = getOccupancyCityConfig(citySlug);

  if (citySlug === "brno" && portal === "sreality") {
    if (options?.prefetched) {
      return {
        data: options.prefetched,
        provider: options.provider ?? "sreality",
      };
    }
    const data = await fetchBrnoRentalsListings(maxPages, (progress) => {
      reportProgress(
        progress.page,
        progress.page,
        progress.listingsTotal,
        `Sreality · str. ${progress.page}/${progress.maxPages}`,
      );
    });
    return { data, provider: "sreality" };
  }

  if (portal === "immobiliare_scraper") {
    if (options?.prefetched) {
      return {
        data: options.prefetched,
        provider: options.provider ?? "reggio_rentals",
      };
    }
    const data = await fetchReggioRentalsListings(maxPages, (progress) => {
      reportProgress(
        progress.page,
        progress.page,
        progress.listingsTotal,
        `Scraper · pag. ${progress.page}/${progress.maxPages}`,
      );
    });
    return { data, provider: "reggio_rentals" };
  }

  const italyPortal = portal === "idealista" || portal === "immobiliare" ? portal : "idealista";
  const result = await fetchItalyListingsWithFallback(
    cityConfig.city,
    "rent",
    getDefaultListingsProvider(),
    maxPages,
    (pageProgress) => {
      reportProgress(
        pageProgress.page,
        pageProgress.page,
        pageProgress.listingsTotal,
        `Pagina ${pageProgress.page}/${pageProgress.maxPages}`,
      );
    },
    italyPortal,
  );
  return { data: result.data, provider: result.provider };
}

export async function runOccupancySnapshot(
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
  onProgress?: (progress: OccupancySnapshotProgressState) => void,
  options?: OccupancySnapshotOptions,
): Promise<OccupancySnapshotResult> {
  const citySlug = options?.citySlug ?? defaultOccupancyCitySlug();
  const cityConfig = getOccupancyCityConfig(citySlug);
  const maxPages =
    portal === "immobiliare_scraper"
      ? Math.min(resolveItalyListingMaxPages(OCCUPANCY_FETCH_MAX_PAGES), 10)
      : cityConfig.market === "cz"
        ? resolveBatchFetchPageLimit(OCCUPANCY_FETCH_MAX_PAGES, "cz")
        : resolveItalyListingMaxPages(OCCUPANCY_FETCH_MAX_PAGES);
  const totalSteps = maxPages + 1;

  const reportProgress = (
    current: number,
    page: number,
    listingsTotal: number,
    label: string,
  ) => {
    onProgress?.({
      current,
      total: totalSteps,
      page,
      maxPages,
      listingsTotal,
      label,
    });
  };

  const { data, provider } = await fetchOccupancyListings(
    citySlug,
    portal,
    maxPages,
    reportProgress,
    options,
  );

  reportProgress(maxPages, maxPages, data.listings.length, "Salvataggio snapshot…");

  const fetchedAt = data.fetched_at || new Date().toISOString();
  const basics = data.listings.map((listing) => mapListingToBasic(listing, citySlug));
  const currentIds = new Set(basics.map((l) => l.id));

  const registry = await loadRegistry(citySlug, portal);
  const listings = { ...registry.listings };

  let newCount = 0;
  let rentedCount = 0;
  const currency = cityConfig.market === "cz" ? "CZK" : "EUR";

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
    const rented = markRented(tracked, fetchedAt);
    listings[id] = rented;
    rentedCount++;
    await logPresumedRentalRemoval(rented, fetchedAt, portal, citySlug, currency);
  }

  const updatedRegistry = {
    ...(registry.snapshot_count ? registry : emptyRegistry(citySlug, portal)),
    city: cityConfig.city,
    market: cityConfig.market,
    portal,
    updated_at: fetchedAt,
    snapshot_count: registry.snapshot_count + 1,
    last_provider: provider,
    listings,
  };

  await saveSnapshot(
    {
      fetched_at: fetchedAt,
      active_count: basics.length,
      listings: basics,
    },
    citySlug,
    portal,
  );
  await saveRegistry(updatedRegistry, citySlug, portal);

  const metrics = await computeOccupancyMetrics(updatedRegistry, {
    citySlug,
    period: DEFAULT_OCCUPANCY_METRICS_PERIOD,
  });

  reportProgress(totalSteps, maxPages, basics.length, "Completato");

  return {
    registry: updatedRegistry,
    metrics,
    fetched_count: basics.length,
    new_count: newCount,
    rented_count: rentedCount,
  };
}
