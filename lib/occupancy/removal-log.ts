import type { OccupancyPortal } from "./portals";
import type { OccupancyRemovalEvent, TrackedRentalListing } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import { occupancyRemovalsLogPath } from "./constants";
import { defaultOccupancyCitySlug, type OccupancyCitySlug } from "./cities";
import { normalizeOccupancyPropertyType } from "./filtered-breakdown";
import { loadRegistry } from "./registry";

const MAX_REMOVAL_EVENTS = 500;

function formatMoney(value: number, currency: "EUR" | "CZK"): string {
  return new Intl.NumberFormat(currency === "CZK" ? "cs-CZ" : "it-IT", {
    style: "currency",
    currency,
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
    property_type: normalizeOccupancyPropertyType(listing),
    address: listing.address,
    zone: listing.zone,
    url: listing.url ?? null,
    lat: listing.lat,
    lng: listing.lng,
    price_history: listing.price_history,
  };
}

async function enrichRemovalEvents(
  events: OccupancyRemovalEvent[],
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
): Promise<OccupancyRemovalEvent[]> {
  const needsEnrichment = events.some((e) => !e.property_type || !e.url);
  if (!needsEnrichment) return events;

  const registry = await loadRegistry(citySlug, portal);
  return events.map((event) => {
    if (event.property_type && event.url) return event;
    const tracked = registry.listings[event.id];
    if (!tracked) {
      return {
        ...event,
        property_type: event.property_type ?? normalizeOccupancyPropertyType(event),
      };
    }
    return {
      ...event,
      property_type:
        event.property_type ??
        normalizeOccupancyPropertyType({
          property_type: tracked.property_type,
          url: tracked.url ?? event.url,
        }),
      url: event.url ?? tracked.url ?? null,
      zone: event.zone ?? tracked.zone,
    };
  });
}

function logRemovalToConsole(event: OccupancyRemovalEvent, currency: "EUR" | "CZK"): void {
  const perSqm =
    event.sqm != null && event.sqm > 0 ? ` · ${formatMoney(event.price / event.sqm, currency)}/m²` : "";
  const priceChanges =
    event.price_history.length > 1
      ? ` · price changes: ${event.price_history.map((p) => formatMoney(p.price, currency)).join(" → ")}`
      : "";
  const dom =
    event.days_on_market != null ? ` · DOM ${event.days_on_market}d` : "";

  console.log(
    `[occupancy:removed] ${event.id} · ${event.zone ?? "—"} · ${formatMoney(event.price, currency)}${perSqm}${dom}${priceChanges} · ${event.address ?? "—"}`,
  );
}

export async function logPresumedRentalRemoval(
  listing: TrackedRentalListing,
  detectedAt: string,
  portal: OccupancyPortal,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  currency: "EUR" | "CZK" = "EUR",
): Promise<OccupancyRemovalEvent> {
  const event = toRemovalEvent(listing, detectedAt, portal);
  logRemovalToConsole(event, currency);

  const path = occupancyRemovalsLogPath(citySlug, portal);
  const existing = (await readJsonFile<OccupancyRemovalEvent[]>(path)) ?? [];
  const next = [event, ...existing.filter((item) => item.id !== event.id || item.detected_at !== event.detected_at)].slice(
    0,
    MAX_REMOVAL_EVENTS,
  );
  await writeJsonFile(path, next);

  return event;
}

export async function loadRemovalEvents(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal,
  limit = 100,
): Promise<OccupancyRemovalEvent[]> {
  const events =
    (await readJsonFile<OccupancyRemovalEvent[]>(occupancyRemovalsLogPath(citySlug, portal))) ?? [];
  const enriched = await enrichRemovalEvents(events.slice(0, limit), citySlug, portal);
  return enriched;
}
