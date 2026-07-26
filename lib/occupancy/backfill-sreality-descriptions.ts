import type { OccupancyRemovalEvent, TrackedRentalListing } from "@/lib/types";
import { getCache } from "@/lib/server/listings-cache";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import { fetchSrealityListingDescription } from "@/lib/server/sreality-search";
import { occupancyRemovalsLogPath } from "./constants";
import { getOccupancyCityConfig, type OccupancyCitySlug } from "./cities";
import type { OccupancyPortal } from "./portals";
import { loadRegistry, saveRegistry } from "./registry";

export interface BackfillDescriptionsProgress {
  phase: "registry" | "removals";
  done: number;
  total: number;
  updated: number;
  failed: number;
}

export interface BackfillDescriptionsResult {
  registryChecked: number;
  registryUpdated: number;
  removalsChecked: number;
  removalsUpdated: number;
  failed: number;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function listingUrlMap(citySlug: OccupancyCitySlug): Promise<Map<string, string>> {
  const { city, market } = getOccupancyCityConfig(citySlug);
  const cache = await getCache(market, city, "rent");
  const map = new Map<string, string>();
  for (const listing of cache?.listings ?? []) {
    if (listing.url?.trim()) map.set(listing.id, listing.url.trim());
  }
  return map;
}

export async function backfillSrealityDescriptions(
  citySlug: OccupancyCitySlug = "brno",
  portal: OccupancyPortal = "sreality",
  onProgress?: (progress: BackfillDescriptionsProgress) => void,
): Promise<BackfillDescriptionsResult> {
  const [registry, urlById] = await Promise.all([
    loadRegistry(citySlug, portal),
    listingUrlMap(citySlug),
  ]);
  const listings = Object.values(registry.listings);
  const missingRegistry = listings.filter(
    (listing) => listing.id.startsWith("sr_") && !listing.description?.trim(),
  );

  let registryUpdated = 0;
  let failed = 0;
  const nextListings: Record<string, TrackedRentalListing> = { ...registry.listings };

  for (let i = 0; i < missingRegistry.length; i++) {
    const listing = missingRegistry[i]!;
    onProgress?.({
      phase: "registry",
      done: i + 1,
      total: missingRegistry.length,
      updated: registryUpdated,
      failed,
    });

    const fields = await fetchSrealityListingDescription(listing.id, {
      url: listing.url ?? urlById.get(listing.id) ?? null,
    });
    if (!fields?.description) {
      failed += 1;
      await sleep(80);
      continue;
    }

    nextListings[listing.id] = {
      ...listing,
      description: fields.description,
      listing_published_at: listing.listing_published_at ?? fields.listing_published_at,
      listing_updated_at: listing.listing_updated_at ?? fields.listing_updated_at,
      url: listing.url ?? urlById.get(listing.id) ?? null,
    };
    registryUpdated += 1;
    await sleep(80);
  }

  if (registryUpdated > 0) {
    await saveRegistry(
      {
        ...registry,
        listings: nextListings,
        updated_at: new Date().toISOString(),
      },
      citySlug,
      portal,
    );
  }

  const removalsPath = occupancyRemovalsLogPath(citySlug, portal);
  const removals = (await readJsonFile<OccupancyRemovalEvent[]>(removalsPath)) ?? [];
  const missingRemovals = removals.filter(
    (event) => event.id.startsWith("sr_") && !event.description?.trim(),
  );

  let removalsUpdated = 0;
  const nextRemovals = [...removals];

  for (let i = 0; i < missingRemovals.length; i++) {
    const event = missingRemovals[i]!;
    onProgress?.({
      phase: "removals",
      done: i + 1,
      total: missingRemovals.length,
      updated: removalsUpdated,
      failed,
    });

    const fromRegistry = nextListings[event.id]?.description?.trim() || null;
    let description = fromRegistry;

    if (!description) {
      const fields = await fetchSrealityListingDescription(event.id, {
        url: event.url ?? urlById.get(event.id) ?? null,
      });
      if (!fields?.description) {
        failed += 1;
        await sleep(80);
        continue;
      }
      description = fields.description;
      await sleep(80);
    }

    const idx = nextRemovals.findIndex(
      (item) => item.id === event.id && item.detected_at === event.detected_at,
    );
    if (idx < 0) continue;
    nextRemovals[idx] = {
      ...nextRemovals[idx]!,
      description,
      url: nextRemovals[idx]!.url ?? urlById.get(event.id) ?? null,
    };
    removalsUpdated += 1;
  }

  if (removalsUpdated > 0) {
    await writeJsonFile(removalsPath, nextRemovals);
  }

  return {
    registryChecked: missingRegistry.length,
    registryUpdated,
    removalsChecked: missingRemovals.length,
    removalsUpdated,
    failed,
  };
}
