import type { OccupancyBasicListing } from "@/lib/types";
import {
  defaultOccupancyCitySlug,
  getOccupancyCityConfig,
  type OccupancyCitySlug,
} from "./cities";
import { resolveBrnoZone } from "./brno-zones";
import { resolveCzechZone } from "./cz-zones";
import { resolveReggioCalabriaZone } from "./reggio-zones";

export function resolveListingZone(
  address: string | null,
  lat?: number | null,
  lng?: number | null,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  description?: string | null,
): string {
  const { zoneResolver, city } = getOccupancyCityConfig(citySlug);
  if (zoneResolver === "brno") {
    return resolveBrnoZone(address, lat, lng, description);
  }
  if (zoneResolver === "cz") {
    return resolveCzechZone(address, city);
  }
  return resolveReggioCalabriaZone(address, lat, lng);
}

export function withResolvedZone<T extends OccupancyBasicListing>(
  listing: T,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
): T {
  return {
    ...listing,
    zone: resolveListingZone(
      listing.address,
      listing.lat,
      listing.lng,
      citySlug,
      listing.description,
    ),
  };
}

export function remapListingZones<T extends OccupancyBasicListing>(
  listings: T[],
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
): T[] {
  return listings.map((listing) => withResolvedZone(listing, citySlug));
}

export function isReggioOccupancyCity(city: string): boolean {
  return city.trim().toLowerCase() === getOccupancyCityConfig("reggio_calabria").city.toLowerCase();
}
