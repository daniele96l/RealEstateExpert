import { resolvePropertyCondition, type PropertyConditionInfo } from "./property-condition";
import type { CityListingsCache, ListingDetail, MapListing } from "./types";

export function mergeListingCondition(
  listing: MapListing,
  source?: Partial<PropertyConditionInfo> | null,
): MapListing {
  if (!source) return normalizeListingCondition(listing);
  const hasCondition =
    source.condition_status != null ||
    source.condition != null ||
    source.needs_renovation != null;
  if (!hasCondition) return normalizeListingCondition(listing);

  return {
    ...listing,
    condition_status: source.condition_status ?? listing.condition_status ?? null,
    condition: source.condition ?? listing.condition ?? null,
    needs_renovation: source.needs_renovation ?? listing.needs_renovation ?? null,
  };
}

export function normalizeListingCondition(listing: MapListing): MapListing {
  const hasStored =
    listing.condition_status != null ||
    listing.condition != null ||
    listing.needs_renovation != null;
  if (hasStored) {
    return {
      ...listing,
      condition_status: listing.condition_status ?? null,
      condition: listing.condition ?? null,
      needs_renovation: listing.needs_renovation ?? null,
    };
  }

  const inferred = resolvePropertyCondition(null, listingConditionText(listing));
  if (inferred.condition_status != null) {
    return { ...listing, ...inferred };
  }

  return {
    ...listing,
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

export function listingConditionText(listing: Pick<MapListing, "title" | "address">): string {
  return `${listing.title} ${listing.address ?? ""}`.trim();
}

export function mergeListingsConditionFromServer(
  local: MapListing[],
  server: MapListing[],
): MapListing[] {
  const byId = new Map(server.map((listing) => [listing.id, listing]));
  return local.map((listing) => {
    const peer = byId.get(listing.id);
    if (!peer) return listing;
    return mergeListingCondition(listing, peer);
  });
}

export function mergeCityCacheConditionFromServer(
  local: CityListingsCache | null,
  server: CityListingsCache | null,
): CityListingsCache | null {
  if (!local) return server;
  if (!server) return local;
  if (!local.listings.length && server.listings.length > 0) return server;
  return {
    ...local,
    listings: mergeListingsConditionFromServer(local.listings, server.listings),
  };
}

export function enrichListingFromDetail(
  listing: MapListing,
  detail: Pick<ListingDetail, "condition_status" | "condition" | "needs_renovation">,
): MapListing {
  return mergeListingCondition(listing, detail);
}

export function patchCacheListingsCondition(
  cache: CityListingsCache | null,
  patches: Map<string, Pick<ListingDetail, "condition" | "condition_status" | "needs_renovation">>,
): CityListingsCache | null {
  if (!cache || patches.size === 0) return cache;
  const listings = cache.listings.map((listing) => {
    const patch = patches.get(listing.id);
    return patch ? mergeListingCondition(listing, patch) : listing;
  });
  return { ...cache, listings };
}
