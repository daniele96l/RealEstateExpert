import type {
  OccupancyListingChangeStatus,
  OccupancyMapListing,
  OccupancySnapshot,
  OccupancySnapshotDiff,
} from "@/lib/types";
import { remapListingZones } from "./zone";

function hasCoords(listing: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng) &&
    !(listing.lat === 0 && listing.lng === 0)
  );
}

function toMapListing(
  listing: {
    id: string;
    lat: number;
    lng: number;
    zone: string | null;
    price: number;
    sqm: number | null;
    address: string | null;
  },
  change_status?: OccupancyListingChangeStatus,
): OccupancyMapListing {
  return {
    id: listing.id,
    lat: listing.lat,
    lng: listing.lng,
    zone: listing.zone,
    price: listing.price,
    sqm: listing.sqm,
    address: listing.address,
    change_status,
  };
}

export function buildMapListings(
  snapshotDiff: OccupancySnapshotDiff | null,
  allSnapshots: OccupancySnapshot[],
  selected: string | null,
): OccupancyMapListing[] {
  if (snapshotDiff) {
    return snapshotDiff.listings
      .filter(hasCoords)
      .map((listing) => toMapListing(listing, listing.change_status));
  }

  const snapshot = selected
    ? allSnapshots.find((item) => item.fetched_at === selected) ?? allSnapshots[allSnapshots.length - 1]
    : allSnapshots[allSnapshots.length - 1];

  if (!snapshot) return [];

  return remapListingZones(snapshot.listings)
    .filter(hasCoords)
    .map((listing) => toMapListing(listing, "still_active"));
}
