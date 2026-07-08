import type { OccupancyPortal } from "./portals";
import type { OccupancyRemovalEvent, TrackedRentalListing } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import { occupancyRemovalsLogPath } from "./constants";

const MAX_REMOVAL_EVENTS = 500;

function formatMoney(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function toRemovalEvent(
  listing: TrackedRentalListing,
  detectedAt: string,
  portal: OccupancyPortal,
): OccupancyRemovalEvent {
  return {
    id: listing.id,
    portal,
    detected_at: detectedAt,
    presumed_rented_at: listing.rented_at ?? listing.last_seen_at,
    first_seen_at: listing.first_seen_at,
    last_seen_at: listing.last_seen_at,
    days_on_market: listing.days_on_market,
    price: listing.price,
    sqm: listing.sqm,
    rooms: listing.rooms,
    address: listing.address,
    zone: listing.zone,
    lat: listing.lat,
    lng: listing.lng,
    price_history: listing.price_history,
  };
}

function logRemovalToConsole(event: OccupancyRemovalEvent): void {
  const perSqm =
    event.sqm != null && event.sqm > 0 ? ` · ${formatMoney(event.price / event.sqm)}/m²` : "";
  const priceChanges =
    event.price_history.length > 1
      ? ` · price changes: ${event.price_history.map((p) => formatMoney(p.price)).join(" → ")}`
      : "";
  const dom =
    event.days_on_market != null ? ` · DOM ${event.days_on_market}d` : "";

  console.log(
    `[occupancy:removed] ${event.id} · ${event.zone ?? "—"} · ${formatMoney(event.price)}${perSqm}${dom}${priceChanges} · ${event.address ?? "—"}`,
  );
}

export async function logPresumedRentalRemoval(
  listing: TrackedRentalListing,
  detectedAt: string,
  portal: OccupancyPortal,
): Promise<OccupancyRemovalEvent> {
  const event = toRemovalEvent(listing, detectedAt, portal);
  logRemovalToConsole(event);

  const path = occupancyRemovalsLogPath(portal);
  const existing = (await readJsonFile<OccupancyRemovalEvent[]>(path)) ?? [];
  const next = [event, ...existing.filter((item) => item.id !== event.id || item.detected_at !== event.detected_at)].slice(
    0,
    MAX_REMOVAL_EVENTS,
  );
  await writeJsonFile(path, next);

  return event;
}

export async function loadRemovalEvents(
  portal: OccupancyPortal,
  limit = 100,
): Promise<OccupancyRemovalEvent[]> {
  const events = (await readJsonFile<OccupancyRemovalEvent[]>(occupancyRemovalsLogPath(portal))) ?? [];
  return events.slice(0, limit);
}
