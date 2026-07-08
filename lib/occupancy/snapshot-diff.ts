import type {
  OccupancyBasicListing,
  OccupancyListingChangeStatus,
  OccupancySnapshot,
  OccupancySnapshotDiff,
  OccupancySnapshotListing,
} from "@/lib/types";
import { withResolvedZone } from "./zone";

function shortenAddress(address: string | null): string {
  if (!address?.trim()) return "—";
  const trimmed = address.trim();
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69)}…`;
}

function withStatus(
  listing: OccupancyBasicListing,
  change_status: OccupancyListingChangeStatus,
): OccupancySnapshotListing {
  return {
    ...listing,
    address: shortenAddress(listing.address),
    change_status,
  };
}

function withResolvedListing(
  listing: OccupancyBasicListing,
  change_status: OccupancyListingChangeStatus,
): OccupancySnapshotListing {
  return withResolvedZone(withStatus(listing, change_status));
}

function sortListings(a: OccupancySnapshotListing, b: OccupancySnapshotListing): number {
  const statusOrder: Record<OccupancyListingChangeStatus, number> = {
    removed: 0,
    new: 1,
    still_active: 2,
  };
  const byStatus = statusOrder[a.change_status] - statusOrder[b.change_status];
  if (byStatus !== 0) return byStatus;
  const zoneCmp = (a.zone ?? "").localeCompare(b.zone ?? "", "it");
  if (zoneCmp !== 0) return zoneCmp;
  return b.price - a.price;
}

export function computeSnapshotDiff(
  current: OccupancySnapshot,
  previous: OccupancySnapshot,
): OccupancySnapshotDiff {
  const prevIds = new Set(previous.listings.map((l) => l.id));
  const currIds = new Set(current.listings.map((l) => l.id));

  const still_active: OccupancySnapshotListing[] = [];
  const new_listings: OccupancySnapshotListing[] = [];
  const removed_listings: OccupancySnapshotListing[] = [];

  for (const listing of current.listings) {
    if (prevIds.has(listing.id)) {
      still_active.push(withResolvedListing(listing, "still_active"));
    } else {
      new_listings.push(withResolvedListing(listing, "new"));
    }
  }

  for (const listing of previous.listings) {
    if (!currIds.has(listing.id)) {
      removed_listings.push(withResolvedListing(listing, "removed"));
    }
  }

  const listings = [...still_active, ...new_listings, ...removed_listings].sort(sortListings);

  return {
    current_fetched_at: current.fetched_at,
    previous_fetched_at: previous.fetched_at,
    still_active_count: still_active.length,
    new_count: new_listings.length,
    removed_count: removed_listings.length,
    listings,
  };
}
