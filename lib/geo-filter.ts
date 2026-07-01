import type { MapCenter, MapListing } from "./types";

export const AREA_PRESETS = {
  city: { id: "city" as const, label: "Intera città", radiusM: null },
  centro: { id: "centro" as const, label: "Centro (1 km)", radiusM: 1_000 },
  quartiere: { id: "quartiere" as const, label: "Quartiere (2.5 km)", radiusM: 2_500 },
} as const;

export type AreaPresetId = keyof typeof AREA_PRESETS | "custom";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function listingDistanceMeters(listing: MapListing, center: GeoPoint): number | null {
  if (listing.lat === 0 && listing.lng === 0) return null;
  if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) return null;
  return distanceMeters(center, { lat: listing.lat, lng: listing.lng });
}

export function filterListingsByRadius(
  listings: MapListing[],
  center: GeoPoint,
  radiusM: number | null,
): MapListing[] {
  if (radiusM == null || radiusM <= 0) return listings;
  return listings.filter((listing) => {
    const dist = listingDistanceMeters(listing, center);
    return dist != null && dist <= radiusM;
  });
}

export function filterListingsByBounds(
  listings: MapListing[],
  bounds: GeoBounds,
): MapListing[] {
  return listings.filter((listing) => {
    if (listing.lat === 0 && listing.lng === 0) return false;
    return (
      listing.lat >= bounds.south &&
      listing.lat <= bounds.north &&
      listing.lng >= bounds.west &&
      listing.lng <= bounds.east
    );
  });
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function centerFromListings(
  listings: MapListing[],
  fallback: MapCenter,
): MapCenter {
  const mappable = listings.filter((l) => l.lat !== 0 || l.lng !== 0);
  if (!mappable.length) return fallback;
  const lat = mappable.reduce((s, l) => s + l.lat, 0) / mappable.length;
  const lng = mappable.reduce((s, l) => s + l.lng, 0) / mappable.length;
  return { lat, lng, display_name: fallback.display_name };
}
