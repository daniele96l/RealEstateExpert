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

/** Closed polygon ring (first point need not repeat last). */
export type GeoPolygon = GeoPoint[];

export function pointInPolygon(point: GeoPoint, polygon: GeoPolygon): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function filterListingsByPolygon(
  listings: MapListing[],
  polygon: GeoPolygon,
): MapListing[] {
  if (polygon.length < 3) return listings;
  return listings.filter((listing) => {
    if (listing.lat === 0 && listing.lng === 0) return false;
    if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) return false;
    return pointInPolygon({ lat: listing.lat, lng: listing.lng }, polygon);
  });
}

export function polygonCentroid(polygon: GeoPolygon): GeoPoint | null {
  if (polygon.length < 3) return null;
  const lat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const lng = polygon.reduce((s, p) => s + p.lng, 0) / polygon.length;
  return { lat, lng };
}

/** Approximate circle as a polygon ring (closed on output when asGeoJsonRing). */
export function circlePolygon(center: GeoPoint, radiusM: number, steps = 48): GeoPolygon {
  if (radiusM <= 0 || steps < 8) return [];
  const R = 6_371_000;
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const points: GeoPolygon = [];

  for (let i = 0; i < steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(radiusM / R) +
        Math.cos(lat1) * Math.sin(radiusM / R) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(radiusM / R) * Math.cos(lat1),
        Math.cos(radiusM / R) - Math.sin(lat1) * Math.sin(lat2),
      );
    points.push({ lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI });
  }

  return points;
}

export function isValidPolygon(polygon: GeoPolygon | null | undefined): polygon is GeoPolygon {
  return Array.isArray(polygon) && polygon.length >= 3;
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
