import { readLocalPropertyDetailCache } from "./property-detail-cache-client";
import {
  enrichListingFromDetail,
  normalizeListingCondition,
} from "./listing-condition-enrich";
import type { MapListing } from "./types";

export function enrichListingConditionClient(listing: MapListing): MapListing {
  const detail = readLocalPropertyDetailCache(listing.id);
  return detail ? enrichListingFromDetail(listing, detail) : normalizeListingCondition(listing);
}

export function enrichListingsConditionClient(listings: MapListing[]): MapListing[] {
  return listings.map((listing) => enrichListingConditionClient(listing));
}
