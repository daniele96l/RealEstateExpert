import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { pointInPolygon, polygonCentroid, type GeoPoint, type GeoPolygon } from "@/lib/geo-filter";
import zonePolygonsGeojson from "./data/zone-polygons.json";

export interface ReggioZonePolygonFeature {
  zone: string;
  sources: string[];
  polygons: GeoPolygon[];
  centroid: GeoPoint | null;
}

function geometryToPolygons(geometry: Polygon | MultiPolygon): GeoPolygon[] {
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    if (!ring?.length) return [];
    return [
      ring.map(([lng, lat]) => ({
        lat,
        lng,
      })),
    ];
  }

  return geometry.coordinates
    .map((poly) => poly[0])
    .filter((ring): ring is number[][] => Boolean(ring?.length))
    .map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
}

function buildZonePolygonMap(): Map<string, ReggioZonePolygonFeature> {
  const collection = zonePolygonsGeojson as FeatureCollection<Polygon | MultiPolygon>;
  const map = new Map<string, ReggioZonePolygonFeature>();

  for (const feature of collection.features) {
    const zone = feature.properties?.zone as string | undefined;
    if (!zone) continue;
    const polygons = geometryToPolygons(feature.geometry);
    if (!polygons.length) continue;

    let centroid: GeoPoint | null = null;
    for (const poly of polygons) {
      const c = polygonCentroid(poly);
      if (c) {
        centroid = c;
        break;
      }
    }

    map.set(zone, {
      zone,
      sources: (feature.properties?.sources as string[] | undefined) ?? [],
      polygons,
      centroid,
    });
  }

  return map;
}

export const REGGIO_ZONE_POLYGONS: Map<string, ReggioZonePolygonFeature> = buildZonePolygonMap();

export function getReggioZonePolygon(zone: string): ReggioZonePolygonFeature | null {
  return REGGIO_ZONE_POLYGONS.get(zone) ?? null;
}

export function pointInReggioMacroZone(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const point = { lat, lng };

  for (const [zone, feature] of REGGIO_ZONE_POLYGONS) {
    for (const poly of feature.polygons) {
      if (pointInPolygon(point, poly)) return zone;
    }
  }

  return null;
}

export function allReggioZonePolygonFeatures(): ReggioZonePolygonFeature[] {
  return [...REGGIO_ZONE_POLYGONS.values()];
}
