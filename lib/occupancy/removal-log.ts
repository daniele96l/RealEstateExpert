import type { OccupancyPortal } from "./portals";
import type { OccupancyRemovalEvent, TrackedRentalListing } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/server/fs-cache-io";
import {
  DEFAULT_OCCUPANCY_OPERATION,
  occupancyRemovalsLogPath,
  type OccupancyOperation,
} from "./constants";
import { defaultOccupancyCitySlug, type OccupancyCitySlug } from "./cities";
import { normalizeOccupancyPropertyType } from "./filtered-breakdown";
import { loadRegistry } from "./registry";

const MAX_REMOVAL_EVENTS = 2000;

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
    description: listing.description ?? null,
    title: listing.title ?? null,
    bathrooms: listing.bathrooms ?? null,
    floor: listing.floor ?? null,
    energy_class: listing.energy_class ?? null,
    energy_kwh_sqm: listing.energy_kwh_sqm ?? null,
    images: listing.images ?? null,
    furnished: listing.furnished ?? null,
    built_year: listing.built_year ?? null,
    lift: listing.lift ?? null,
    garden: listing.garden ?? null,
    terrace: listing.terrace ?? null,
    garage: listing.garage ?? null,
    condominio_monthly: listing.condominio_monthly ?? null,
    advertiser_name: listing.advertiser_name ?? null,
    condition: listing.condition ?? null,
    condition_status: listing.condition_status ?? null,
    needs_renovation: listing.needs_renovation ?? null,
    listing_published_at: listing.listing_published_at ?? null,
    listing_updated_at: listing.listing_updated_at ?? null,
    lat: listing.lat,
    lng: listing.lng,
    price_history: listing.price_history,
  };
}

async function enrichRemovalEvents(
  events: OccupancyRemovalEvent[],
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
  operation: OccupancyOperation,
): Promise<OccupancyRemovalEvent[]> {
  const needsEnrichment = events.some((e) => !e.property_type || !e.url || !e.description);
  if (!needsEnrichment) return events;

  const registry = await loadRegistry(citySlug, portal, operation);
  return events.map((event) => {
    if (event.property_type && event.url && event.description) return event;
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
      description: event.description ?? tracked.description ?? null,
      zone: event.zone ?? tracked.zone,
    };
  });
}

function logRemovalToConsole(
  event: OccupancyRemovalEvent,
  currency: "EUR" | "CZK",
  operation: OccupancyOperation,
): void {
  const perSqm =
    event.sqm != null && event.sqm > 0 ? ` · ${formatMoney(event.price / event.sqm, currency)}/m²` : "";
  const priceChanges =
    event.price_history.length > 1
      ? ` · price changes: ${event.price_history.map((p) => formatMoney(p.price, currency)).join(" → ")}`
      : "";
  const dom =
    event.days_on_market != null ? ` · DOM ${event.days_on_market}d` : "";
  const tag = operation === "sale" ? "sale-rate:removed" : "occupancy:removed";

  console.log(
    `[${tag}] ${event.id} · ${event.title ?? "—"} · ${event.zone ?? "—"} · ${formatMoney(event.price, currency)}${perSqm}${dom}${priceChanges} · ${event.address ?? "—"} · ${event.url ?? "no-url"}`,
  );
}

export async function logPresumedRentalRemoval(
  listing: TrackedRentalListing,
  detectedAt: string,
  portal: OccupancyPortal,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  currency: "EUR" | "CZK" = "EUR",
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancyRemovalEvent> {
  const event = toRemovalEvent(listing, detectedAt, portal);
  logRemovalToConsole(event, currency, operation);

  const path = occupancyRemovalsLogPath(citySlug, portal, operation);
  const existing = (await readJsonFile<OccupancyRemovalEvent[]>(path)) ?? [];
  const next = [
    event,
    ...existing.filter((item) => item.id !== event.id || item.detected_at !== event.detected_at),
  ];
  await writeJsonFile(path, next);

  return event;
}

export async function loadRemovalEvents(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal,
  limit?: number,
  operation: OccupancyOperation = DEFAULT_OCCUPANCY_OPERATION,
): Promise<OccupancyRemovalEvent[]> {
  const events =
    (await readJsonFile<OccupancyRemovalEvent[]>(
      occupancyRemovalsLogPath(citySlug, portal, operation),
    )) ?? [];
  const selected = limit != null ? events.slice(0, limit) : events;
  const enriched = await enrichRemovalEvents(selected, citySlug, portal, operation);
  return enriched;
}
