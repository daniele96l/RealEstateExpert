import type { MapListing, OccupancyBasicListing } from "@/lib/types";
import type { OccupancyCitySlug } from "./cities";
import { resolveListingZone } from "./zone";

const MAX_STORED_IMAGES = 8;
const MAX_DESCRIPTION_CHARS = 12_000;

function preferScalar<T>(
  next: T | null | undefined,
  prev: T | null | undefined,
): T | null {
  if (next == null) return prev ?? null;
  if (typeof next === "string" && !next.trim()) return prev ?? null;
  return next;
}

function preferImages(
  next: string[] | null | undefined,
  prev: string[] | null | undefined,
): string[] | null {
  const cleanedNext = (next ?? []).map((url) => url.trim()).filter(Boolean);
  const cleanedPrev = (prev ?? []).map((url) => url.trim()).filter(Boolean);
  if (!cleanedNext.length) return cleanedPrev.length ? cleanedPrev.slice(0, MAX_STORED_IMAGES) : null;
  if (!cleanedPrev.length) return cleanedNext.slice(0, MAX_STORED_IMAGES);
  const merged = [...cleanedNext];
  for (const url of cleanedPrev) {
    if (!merged.includes(url)) merged.push(url);
  }
  return merged.slice(0, MAX_STORED_IMAGES);
}

function truncateDescription(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_DESCRIPTION_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_DESCRIPTION_CHARS - 1)}…`;
}

/** Normalize portal MapListing → occupancy snapshot/registry shape (keeps all known detail). */
export function mapListingToOccupancyBasic(
  listing: MapListing,
  citySlug: OccupancyCitySlug,
): OccupancyBasicListing {
  const description = truncateDescription(listing.description);
  return {
    id: listing.id,
    price: listing.price,
    lat: listing.lat,
    lng: listing.lng,
    sqm: listing.sqm,
    rooms: listing.rooms,
    property_type: listing.property_type ?? null,
    address: listing.address,
    zone: resolveListingZone(
      listing.address,
      listing.lat,
      listing.lng,
      citySlug,
      description,
    ),
    url: listing.url,
    listing_published_at: listing.listing_published_at ?? null,
    listing_updated_at: listing.listing_updated_at ?? null,
    description,
    title: listing.title?.trim() || null,
    bathrooms: listing.bathrooms ?? null,
    floor: listing.floor ?? null,
    energy_class: listing.energy_class ?? null,
    energy_kwh_sqm: listing.energy_kwh_sqm ?? null,
    images: preferImages(listing.images, null),
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
  };
}

/** Merge newly scraped basics onto a tracked listing without losing richer prior detail. */
export function mergeOccupancyListingFields(
  tracked: OccupancyBasicListing,
  basic: OccupancyBasicListing,
): OccupancyBasicListing {
  return {
    ...tracked,
    price: basic.price,
    lat: basic.lat,
    lng: basic.lng,
    sqm: preferScalar(basic.sqm, tracked.sqm),
    rooms: preferScalar(basic.rooms, tracked.rooms),
    property_type: preferScalar(basic.property_type, tracked.property_type),
    address: preferScalar(basic.address, tracked.address),
    zone: preferScalar(basic.zone, tracked.zone),
    url: preferScalar(basic.url, tracked.url),
    listing_published_at: preferScalar(basic.listing_published_at, tracked.listing_published_at),
    listing_updated_at: preferScalar(basic.listing_updated_at, tracked.listing_updated_at),
    description: preferScalar(basic.description, tracked.description),
    title: preferScalar(basic.title, tracked.title),
    bathrooms: preferScalar(basic.bathrooms, tracked.bathrooms),
    floor: preferScalar(basic.floor, tracked.floor),
    energy_class: preferScalar(basic.energy_class, tracked.energy_class),
    energy_kwh_sqm: preferScalar(basic.energy_kwh_sqm, tracked.energy_kwh_sqm),
    images: preferImages(basic.images, tracked.images),
    furnished: preferScalar(basic.furnished, tracked.furnished),
    built_year: preferScalar(basic.built_year, tracked.built_year),
    lift: preferScalar(basic.lift, tracked.lift),
    garden: preferScalar(basic.garden, tracked.garden),
    terrace: preferScalar(basic.terrace, tracked.terrace),
    garage: preferScalar(basic.garage, tracked.garage),
    condominio_monthly: preferScalar(basic.condominio_monthly, tracked.condominio_monthly),
    advertiser_name: preferScalar(basic.advertiser_name, tracked.advertiser_name),
    condition: preferScalar(basic.condition, tracked.condition),
    condition_status: preferScalar(basic.condition_status, tracked.condition_status),
    needs_renovation: preferScalar(basic.needs_renovation, tracked.needs_renovation),
  };
}
