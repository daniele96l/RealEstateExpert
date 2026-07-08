import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
  circlePolygon,
  distanceMeters,
  pointInPolygon,
  polygonCentroid,
  type GeoPoint,
  type GeoPolygon,
} from "@/lib/geo-filter";
import { GEO_ZONES } from "./reggio-zone-geo";
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

function polygonSignature(polygons: GeoPolygon[]): string {
  const first = polygons[0]?.[0];
  return first ? `${first.lat.toFixed(5)},${first.lng.toFixed(5)}:${polygons[0]?.length ?? 0}` : "";
}

function buildCircleFallbackFeature(zone: string): ReggioZonePolygonFeature | null {
  const geo = GEO_ZONES.find((entry) => entry.zone === zone);
  if (!geo) return null;
  const ring = circlePolygon({ lat: geo.lat, lng: geo.lng }, geo.maxM);
  if (ring.length < 3) return null;
  return {
    zone,
    sources: ["GEO_ZONES:circle"],
    polygons: [ring],
    centroid: { lat: geo.lat, lng: geo.lng },
  };
}

function buildZonePolygonMap(): Map<string, ReggioZonePolygonFeature> {
  const collection = zonePolygonsGeojson as FeatureCollection<Polygon | MultiPolygon>;
  const map = new Map<string, ReggioZonePolygonFeature>();
  const signatures = new Set<string>();

  for (const feature of collection.features) {
    const zone = feature.properties?.zone as string | undefined;
    if (!zone) continue;
    const polygons = geometryToPolygons(feature.geometry);
    if (!polygons.length) continue;

    const signature = polygonSignature(polygons);
    if (signature) signatures.add(signature);

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

  // Nominatim structured suburb search often returns the whole city boundary for every zone.
  if (signatures.size <= 1 && map.size > 1) {
    map.clear();
    for (const geo of GEO_ZONES) {
      const fallback = buildCircleFallbackFeature(geo.zone);
      if (fallback) map.set(geo.zone, fallback);
    }
  }

  for (const geo of GEO_ZONES) {
    if (!map.has(geo.zone)) {
      const fallback = buildCircleFallbackFeature(geo.zone);
      if (fallback) map.set(geo.zone, fallback);
    }
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
  let best: { zone: string; dist: number } | null = null;

  for (const [zone, feature] of REGGIO_ZONE_POLYGONS) {
    for (const poly of feature.polygons) {
      if (!pointInPolygon(point, poly)) continue;
      const center = feature.centroid ?? polygonCentroid(poly);
      const dist = center ? distanceMeters(point, center) : Number.POSITIVE_INFINITY;
      if (!best || dist < best.dist) best = { zone, dist };
    }
  }

  return best?.zone ?? null;
}

export function allReggioZonePolygonFeatures(): ReggioZonePolygonFeature[] {
  return [...REGGIO_ZONE_POLYGONS.values()];
}
