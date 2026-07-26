import type { OccupancyBasicListing, OccupancyOfferRatePoint, OccupancySnapshot } from "@/lib/types";
import { normalizeOccupancyPropertyType } from "./filtered-breakdown";
import { isOccupancyRoomListing } from "./segment-metrics";

export type OccupancyOfferTypeKey = "flat" | "room" | "other";

function offerTypeKey(listing: OccupancyBasicListing): OccupancyOfferTypeKey {
  const property_type = normalizeOccupancyPropertyType(listing);
  if (isOccupancyRoomListing({ ...listing, property_type })) return "room";
  if (property_type) return "flat";
  if (listing.rooms != null || (listing.sqm != null && listing.sqm >= 20)) return "flat";
  return "other";
}

function classifyNewListings(listings: OccupancyBasicListing[]): {
  new_flat: number;
  new_room: number;
  new_other: number;
} {
  let new_flat = 0;
  let new_room = 0;
  let new_other = 0;
  for (const listing of listings) {
    const key = offerTypeKey(listing);
    if (key === "room") new_room += 1;
    else if (key === "other") new_other += 1;
    else new_flat += 1;
  }
  return { new_flat, new_room, new_other };
}

function formatAxisLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso.slice(0, 10);
  const d = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * Offer rate over time: new listings appearing between consecutive snapshots,
 * broken down by property type (flat / room / other).
 */
export function buildOfferRateSeries(snapshots: OccupancySnapshot[]): OccupancyOfferRatePoint[] {
  if (snapshots.length < 2) return [];

  const points: OccupancyOfferRatePoint[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const previous = snapshots[i - 1]!;
    const current = snapshots[i]!;
    const prevIds = new Set(previous.listings.map((l) => l.id));
    const currIds = new Set(current.listings.map((l) => l.id));

    const newcomers = current.listings.filter((l) => !prevIds.has(l.id));
    const removed_total = previous.listings.reduce(
      (count, listing) => count + (currIds.has(listing.id) ? 0 : 1),
      0,
    );
    const byType = classifyNewListings(newcomers);

    points.push({
      fetched_at: current.fetched_at,
      label: formatAxisLabel(current.fetched_at),
      new_total: newcomers.length,
      new_flat: byType.new_flat,
      new_room: byType.new_room,
      new_other: byType.new_other,
      removed_total,
      active_count: current.active_count,
    });
  }

  return points;
}
