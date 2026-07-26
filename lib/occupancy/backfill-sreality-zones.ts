import type { OccupancyBasicListing, OccupancySnapshot, TrackedRentalListing } from "@/lib/types";
import { getCache } from "@/lib/server/listings-cache";
import { fetchSrealityListingDescription } from "@/lib/server/sreality-search";
import { OCCUPANCY_FALLBACK_ZONE } from "./constants";
import { getOccupancyCityConfig, type OccupancyCitySlug } from "./cities";
import type { OccupancyOperation } from "./operation";
import type { OccupancyPortal } from "./portals";
import {
  invalidateOccupancySnapshotCache,
  loadAllSnapshots,
  loadRegistry,
  saveRegistry,
  saveSnapshot,
} from "./registry";
import { resolveListingZone } from "./zone";

export interface BackfillZonesProgress {
  done: number;
  total: number;
  updated: number;
  failed: number;
}

export interface BackfillZonesResult {
  checked: number;
  updated: number;
  failed: number;
  stillFallback: number;
}

function isWeakAddress(address: string | null | undefined): boolean {
  const trimmed = address?.trim() ?? "";
  return !trimmed || /^brno$/i.test(trimmed);
}

function needsZoneBackfill(listing: TrackedRentalListing): boolean {
  if (!listing.id.startsWith("sr_")) return false;
  if (listing.zone !== OCCUPANCY_FALLBACK_ZONE && listing.zone !== "Altro") {
    return isWeakAddress(listing.address);
  }
  return true;
}

async function listingUrlMap(
  citySlug: OccupancyCitySlug,
  operation: OccupancyOperation,
): Promise<Map<string, string>> {
  const { city, market } = getOccupancyCityConfig(citySlug);
  const cache = await getCache(market, city, operation);
  const map = new Map<string, string>();
  for (const listing of cache?.listings ?? []) {
    if (listing.url?.trim()) map.set(listing.id, listing.url.trim());
  }
  return map;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyLocalityToListing(
  listing: TrackedRentalListing,
  fields: {
    address: string | null;
    city_part: string | null;
    lat: number | null;
    lng: number | null;
    description: string | null;
  },
  citySlug: OccupancyCitySlug,
): TrackedRentalListing {
  const address =
    (isWeakAddress(listing.address) && fields.address) || listing.address;
  const lat =
    isWeakAddress(listing.address) && fields.lat != null ? fields.lat : listing.lat;
  const lng =
    isWeakAddress(listing.address) && fields.lng != null ? fields.lng : listing.lng;
  const description = listing.description ?? fields.description;
  const zone =
    fields.city_part?.trim() ||
    resolveListingZone(address, lat, lng, citySlug, description);

  return {
    ...listing,
    address,
    lat,
    lng,
    description,
    zone,
    url: listing.url,
  };
}

export async function backfillSrealityZones(
  citySlug: OccupancyCitySlug = "brno",
  portal: OccupancyPortal = "sreality",
  operation: OccupancyOperation = "sale",
  onProgress?: (progress: BackfillZonesProgress) => void,
): Promise<BackfillZonesResult> {
  const [registry, urlById, snapshots] = await Promise.all([
    loadRegistry(citySlug, portal, operation),
    listingUrlMap(citySlug, operation),
    loadAllSnapshots(citySlug, portal, operation),
  ]);

  const candidates = Object.values(registry.listings).filter(
    (listing) => listing.status === "active" && needsZoneBackfill(listing),
  );

  let updated = 0;
  let failed = 0;
  const nextListings: Record<string, TrackedRentalListing> = { ...registry.listings };
  const updatedBasics = new Map<string, OccupancyBasicListing>();

  for (let i = 0; i < candidates.length; i++) {
    const listing = candidates[i]!;
    onProgress?.({
      done: i + 1,
      total: candidates.length,
      updated,
      failed,
    });

    const fields = await fetchSrealityListingDescription(listing.id, {
      url: listing.url ?? urlById.get(listing.id) ?? null,
    });
    if (!fields || (!fields.address && !fields.city_part && !fields.description)) {
      // Still try re-resolve from existing description alone.
      const zone = resolveListingZone(
        listing.address,
        listing.lat,
        listing.lng,
        citySlug,
        listing.description,
      );
      if (zone !== listing.zone && zone !== OCCUPANCY_FALLBACK_ZONE) {
        const next = { ...listing, zone };
        nextListings[listing.id] = next;
        updatedBasics.set(listing.id, next);
        updated += 1;
      } else {
        failed += 1;
      }
      await sleep(60);
      continue;
    }

    const next = applyLocalityToListing(listing, fields, citySlug);
    if (
      next.zone !== listing.zone ||
      next.address !== listing.address ||
      next.lat !== listing.lat ||
      next.lng !== listing.lng ||
      next.description !== listing.description
    ) {
      nextListings[listing.id] = next;
      updatedBasics.set(listing.id, next);
      updated += 1;
    }
    await sleep(80);
  }

  if (updated > 0) {
    await saveRegistry(
      {
        ...registry,
        listings: nextListings,
        updated_at: new Date().toISOString(),
      },
      citySlug,
      portal,
      operation,
    );

    const latest = snapshots[snapshots.length - 1];
    if (latest) {
      const patched: OccupancySnapshot = {
        ...latest,
        listings: latest.listings.map((listing) => {
          const patch = updatedBasics.get(listing.id);
          if (!patch) return listing;
          return {
            ...listing,
            address: patch.address,
            lat: patch.lat,
            lng: patch.lng,
            zone: patch.zone,
            description: patch.description ?? listing.description,
          };
        }),
      };
      await saveSnapshot(patched, citySlug, portal, operation);
    } else {
      invalidateOccupancySnapshotCache(citySlug, portal, operation);
    }
  }

  const stillFallback = Object.values(nextListings).filter(
    (listing) =>
      listing.status === "active" &&
      (listing.zone === OCCUPANCY_FALLBACK_ZONE || listing.zone === "Altro"),
  ).length;

  return {
    checked: candidates.length,
    updated,
    failed,
    stillFallback,
  };
}
