import type { GeoPolygon } from "@/lib/geo-filter";
import type { OccupancyMapListing } from "@/lib/types";
import { allReggioZonePolygonFeatures } from "./reggio-zone-polygons";
import { GEO_ZONES } from "./reggio-zones";

const ZONE_PALETTE = [
  "#38bdf8",
  "#c084fc",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#fb923c",
  "#818cf8",
  "#2dd4bf",
  "#e879f9",
] as const;

export function zonePaletteColor(zone: string): string {
  const idx = GEO_ZONES.findIndex((entry) => entry.zone === zone);
  return ZONE_PALETTE[idx >= 0 ? idx % ZONE_PALETTE.length : 0]!;
}

export type OccupancyMapOverlayId = "zones" | "density" | "price" | "darkMap";

export interface ZoneOverlayStats {
  zone: string;
  lat: number;
  lng: number;
  polygons: GeoPolygon[];
  count: number;
  avgPricePerSqm: number | null;
}

export function priceHeatColor(value: number, min: number, max: number): string {
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = 168 - clamped * 148;
  const lightness = 48 + clamped * 8;
  return `hsl(${hue} 78% ${lightness}%)`;
}

export function densityFillOpacity(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  return Math.min(0.42, 0.1 + (count / maxCount) * 0.32);
}

export function buildZoneOverlayStats(listings: OccupancyMapListing[]): ZoneOverlayStats[] {
  const listingsByZone = new Map<string, OccupancyMapListing[]>();
  for (const listing of listings) {
    if (!listing.zone || listing.price <= 0) continue;
    const bucket = listingsByZone.get(listing.zone) ?? [];
    bucket.push(listing);
    listingsByZone.set(listing.zone, bucket);
  }

  const polygonFeatures = allReggioZonePolygonFeatures();
  const polygonByZone = new Map(polygonFeatures.map((f) => [f.zone, f]));

  return GEO_ZONES.map((geo) => {
    const zoneListings = listingsByZone.get(geo.zone) ?? [];
    const count = zoneListings.length;
    const perSqmValues = zoneListings
      .filter((listing) => listing.sqm != null && listing.sqm > 0)
      .map((listing) => listing.price / listing.sqm!);
    const avgPricePerSqm =
      perSqmValues.length > 0
        ? Math.round(perSqmValues.reduce((sum, value) => sum + value, 0) / perSqmValues.length)
        : null;
    const polygonFeature = polygonByZone.get(geo.zone);

    return {
      zone: geo.zone,
      lat: polygonFeature?.centroid?.lat ?? geo.lat,
      lng: polygonFeature?.centroid?.lng ?? geo.lng,
      polygons: polygonFeature?.polygons ?? [],
      count,
      avgPricePerSqm,
    };
  });
}
