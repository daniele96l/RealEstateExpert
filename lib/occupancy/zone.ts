import type { OccupancyBasicListing } from "@/lib/types";
import { OCCUPANCY_CITY } from "./constants";
import { resolveReggioCalabriaZone } from "./reggio-zones";

export function resolveListingZone(
  address: string | null,
  lat?: number | null,
  lng?: number | null,
): string {
  return resolveReggioCalabriaZone(address, lat, lng);
}

export function withResolvedZone<T extends OccupancyBasicListing>(listing: T): T {
  return {
    ...listing,
    zone: resolveListingZone(listing.address, listing.lat, listing.lng),
  };
}

export function remapListingZones<T extends OccupancyBasicListing>(listings: T[]): T[] {
  return listings.map(withResolvedZone);
}

export function isReggioOccupancyCity(city: string): boolean {
  return city.trim().toLowerCase() === OCCUPANCY_CITY.toLowerCase();
}
