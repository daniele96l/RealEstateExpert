/**
 * Build Reggio Calabria macro-zone polygons from OpenStreetMap via Nominatim (primary)
 * and ISTAT ASC shapefiles (fallback for gaps).
 *
 * Usage: npm run build:reggio-zones
 */

import fs from "fs";
import path from "path";
import union from "@turf/union";
import simplify from "@turf/simplify";
import area from "@turf/area";
import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import intersect from "@turf/intersect";
import voronoi from "@turf/voronoi";
import { featureCollection, point } from "@turf/helpers";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";
// @ts-expect-error shapefile has no types
import * as shapefile from "shapefile";
import zoneMapping from "../lib/occupancy/reggio-zone-mapping.json";
import { GEO_ZONES } from "../lib/occupancy/reggio-zone-geo";
import { circlePolygon } from "../lib/geo-filter";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "lib/occupancy/data/zone-polygons.json");
const ISTAT_GIS_DIR = path.join(ROOT, "data/gis/ASC_21");
const REGGIO_ISTAT_CODE = "080063";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RealEstateExpert/1.0 (occupancy zone builder)";
const CIRCLES_ONLY = process.argv.includes("--circles-only");
const SKIP_OSM = CIRCLES_ONLY || process.argv.includes("--voronoi-only");
/** Reject polygons spanning more than ~11 km (Nominatim often returns the whole comune). */
const MAX_ZONE_SPAN_DEG = 0.1;

const OVERPASS_URL = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";
const OVERPASS_QUERY = `
[out:json][timeout:90];
relation(39503);
map_to_area->.city;
(
  way(area.city)["place"~"suburb|neighbourhood|quarter|village|hamlet"];
  relation(area.city)["place"~"suburb|neighbourhood|quarter"];
  way(area.city)["landuse"="residential"]["name"];
);
out geom;
`;

type OsmElement = {
  type: "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function resolveMacroZone(name: string): string | null {
  const normalized = normalizeName(name);
  for (const macroZone of zoneMapping.macroZones) {
    const aliases = zoneMapping.sources[macroZone as keyof typeof zoneMapping.sources] ?? [];
    for (const alias of aliases) {
      const aliasNorm = normalizeName(alias);
      if (normalized === aliasNorm || normalized.includes(aliasNorm) || aliasNorm.includes(normalized)) {
        return macroZone;
      }
    }
  }
  return null;
}

function ringFromGeometry(geometry: Array<{ lat: number; lon: number }>): Position[] | null {
  if (!geometry || geometry.length < 3) return null;
  const ring: Position[] = geometry.map((p) => [p.lon, p.lat]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return ring;
}

function geoJsonToPolygonFeature(
  geometry: Polygon | MultiPolygon,
  name: string,
  macroZone: string,
  source: string,
): Feature<Polygon | MultiPolygon> {
  return {
    type: "Feature",
    properties: { name, macroZone, source },
    geometry,
  };
}

function bboxSpan(geometry: Polygon | MultiPolygon): { lon: number; lat: number } {
  const rings: Position[][] = [];
  if (geometry.type === "Polygon") {
    if (geometry.coordinates[0]) rings.push(geometry.coordinates[0]);
  } else {
    for (const poly of geometry.coordinates) {
      if (poly[0]) rings.push(poly[0]);
    }
  }

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return { lon: maxLon - minLon, lat: maxLat - minLat };
}

function isOversizedPolygon(geometry: Polygon | MultiPolygon): boolean {
  const span = bboxSpan(geometry);
  return span.lon > MAX_ZONE_SPAN_DEG || span.lat > MAX_ZONE_SPAN_DEG;
}

function buildCircleZoneFeature(macroZone: string): Feature<Polygon> {
  const geo = GEO_ZONES.find((entry) => entry.zone === macroZone);
  if (!geo) {
    throw new Error(`Missing GEO_ZONES entry for ${macroZone}`);
  }

  const ring = circlePolygon({ lat: geo.lat, lng: geo.lng }, geo.maxM, 48).map(
    (point) => [point.lng, point.lat] as Position,
  );
  const first = ring[0]!;
  ring.push([...first]);

  return {
    type: "Feature",
    properties: {
      zone: macroZone,
      sources: ["GEO_ZONES:circle"],
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

async function fetchNominatimPolygon(
  suburb: string,
  macroZone: string,
): Promise<Feature<Polygon | MultiPolygon> | null> {
  const queries = [
    `${suburb}, Reggio di Calabria, Calabria, Italy`,
    `${suburb}, Reggio Calabria, Italy`,
  ];

  for (const q of queries) {
    const params = new URLSearchParams({
      q,
      format: "geojson",
      polygon_geojson: "1",
      limit: "3",
      countrycodes: "it",
    });

    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) continue;

    const payload = (await response.json()) as FeatureCollection;
    for (const feature of payload.features ?? []) {
      if (!feature.geometry) continue;
      const geomType = feature.geometry.type;
      if (geomType !== "Polygon" && geomType !== "MultiPolygon") continue;
      if (isOversizedPolygon(feature.geometry as Polygon | MultiPolygon)) continue;

      const name =
        (feature.properties?.name as string | undefined) ??
        (feature.properties?.display_name as string | undefined)?.split(",")[0] ??
        suburb;

      return geoJsonToPolygonFeature(
        feature.geometry as Polygon | MultiPolygon,
        name,
        macroZone,
        `OSM:Nominatim:${suburb}`,
      );
    }
  }

  return null;
}

async function fetchNominatimFeatures(): Promise<Feature<Polygon | MultiPolygon>[]> {
  console.log("Fetching OSM suburb polygons via Nominatim…");
  const features: Feature<Polygon | MultiPolygon>[] = [];
  const seen = new Set<string>();

  for (const macroZone of zoneMapping.macroZones) {
    const aliases = zoneMapping.sources[macroZone as keyof typeof zoneMapping.sources] ?? [];
    for (const alias of aliases) {
      const key = `${macroZone}::${normalizeName(alias)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const feature = await fetchNominatimPolygon(alias, macroZone);
      if (feature) {
        features.push(feature);
        console.log(`  + ${alias} -> ${macroZone}`);
      }
      await sleep(1100);
    }
  }

  console.log(`  Nominatim polygons: ${features.length}`);
  return features;
}

function elementToPolygonFeature(
  element: OsmElement,
  sourceLabel: string,
): Feature<Polygon | MultiPolygon> | null {
  const name = element.tags?.name;
  if (!name) return null;

  const macroZone = resolveMacroZone(name);
  if (!macroZone) return null;

  if (element.type === "way" && element.geometry) {
    const ring = ringFromGeometry(element.geometry);
    if (!ring) return null;
    return geoJsonToPolygonFeature({ type: "Polygon", coordinates: [ring] }, name, macroZone, sourceLabel);
  }

  if (element.type === "relation" && element.members) {
    const rings: Position[][] = [];
    for (const member of element.members) {
      if (member.role === "inner") continue;
      if (!member.geometry) continue;
      const ring = ringFromGeometry(member.geometry);
      if (ring) rings.push(ring);
    }
    if (!rings.length) return null;
    const geometry: Polygon | MultiPolygon =
      rings.length === 1
        ? { type: "Polygon", coordinates: [rings[0]!] }
        : { type: "MultiPolygon", coordinates: rings.map((r) => [r]) };
    return geoJsonToPolygonFeature(geometry, name, macroZone, sourceLabel);
  }

  return null;
}

async function fetchOverpassFeatures(): Promise<Feature<Polygon | MultiPolygon>[]> {
  console.log("Fetching supplemental OSM features via Overpass…");
  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
    });
    if (!response.ok) {
      console.log(`  Overpass skipped (${response.status})`);
      return [];
    }
    const payload = (await response.json()) as { elements: OsmElement[] };
    const features: Feature<Polygon | MultiPolygon>[] = [];
    for (const element of payload.elements ?? []) {
      const feature = elementToPolygonFeature(element, `OSM:Overpass:${element.tags?.name ?? element.id}`);
      if (!feature) continue;
      if (isOversizedPolygon(feature.geometry)) continue;
      features.push(feature);
    }
    console.log(`  Overpass polygons: ${features.length}`);
    return features;
  } catch (err) {
    console.log(`  Overpass skipped (${err instanceof Error ? err.message : err})`);
    return [];
  }
}

async function findIstatShapefile(): Promise<string | null> {
  if (!fs.existsSync(ISTAT_GIS_DIR)) return null;
  const files = fs.readdirSync(ISTAT_GIS_DIR, { recursive: true }) as string[];
  const shp = files.find((f) => f.toLowerCase().endsWith(".shp"));
  return shp ? path.join(ISTAT_GIS_DIR, shp) : null;
}

async function fetchIstatFeatures(): Promise<Feature<Polygon | MultiPolygon>[]> {
  const shpPath = await findIstatShapefile();
  if (!shpPath) {
    console.log("  ISTAT shapefile not found (skip — place files in data/gis/ASC_21/)");
    return [];
  }

  console.log(`Reading ISTAT ASC from ${shpPath}…`);
  const source = await shapefile.open(shpPath);
  const features: Feature<Polygon | MultiPolygon>[] = [];

  while (true) {
    const result = await source.read();
    if (result.done) break;
    const feature = result.value as Feature<Polygon | MultiPolygon> & {
      properties?: Record<string, string>;
    };
    const props = feature.properties ?? {};
    const comune = String(props.COMUNE ?? props.cod_com ?? props.PRO_COM ?? "");
    if (comune !== REGGIO_ISTAT_CODE && !String(props.COMUNE ?? "").includes("Reggio")) {
      continue;
    }
    const name = props.DENASC ?? props.denasc ?? props.NOME ?? props.name;
    if (!name || typeof name !== "string") continue;
    const macroZone = resolveMacroZone(name);
    if (!macroZone) continue;
    features.push(geoJsonToPolygonFeature(feature.geometry, name, macroZone, `ISTAT:${name}`));
  }

  console.log(`  ISTAT polygons: ${features.length}`);
  return features;
}

function unionFeatures(
  features: Feature<Polygon | MultiPolygon>[],
): Feature<Polygon | MultiPolygon> | null {
  if (!features.length) return null;

  let merged: Feature<Polygon | MultiPolygon> | null = features[0]!;
  for (let i = 1; i < features.length; i += 1) {
    const next = features[i]!;
    try {
      const result = union(featureCollection([merged!, next]));
      if (result) merged = result as Feature<Polygon | MultiPolygon>;
    } catch {
      const mergedArea = area(merged!);
      const nextArea = area(next);
      if (nextArea > mergedArea) merged = next;
    }
  }
  return merged;
}

function simplifyFeature(
  feature: Feature<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> {
  try {
    return simplify(feature, { tolerance: 0.00012, highQuality: true }) as Feature<
      Polygon | MultiPolygon
    >;
  } catch {
    return feature;
  }
}

async function fetchCityBoundary(): Promise<Feature<Polygon | MultiPolygon>> {
  const params = new URLSearchParams({
    q: "Reggio di Calabria, Calabria, Italy",
    format: "geojson",
    polygon_geojson: "1",
    limit: "1",
    countrycodes: "it",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`City boundary fetch failed (${response.status})`);
  }

  const payload = (await response.json()) as FeatureCollection;
  const feature = payload.features?.[0];
  if (!feature?.geometry) {
    throw new Error("City boundary not found in Nominatim");
  }

  return simplify(feature as Feature<Polygon | MultiPolygon>, {
    tolerance: 0.0015,
    highQuality: true,
  }) as Feature<Polygon | MultiPolygon>;
}

function buildVoronoiZoneMap(
  cityBoundary: Feature<Polygon | MultiPolygon>,
): Map<string, Feature<Polygon | MultiPolygon>> {
  const cityBbox = bbox(cityBoundary);
  const [minX, minY, maxX, maxY] = cityBbox;
  const pad = 0.03;

  const seeds = GEO_ZONES.map((geo) =>
    point([geo.lng, geo.lat], { macroZone: geo.zone }),
  );
  const ghostPoints = [
    point([minX - pad, minY - pad], { ghost: true }),
    point([maxX + pad, minY - pad], { ghost: true }),
    point([minX - pad, maxY + pad], { ghost: true }),
    point([maxX + pad, maxY + pad], { ghost: true }),
    point([(minX + maxX) / 2, minY - pad], { ghost: true }),
    point([(minX + maxX) / 2, maxY + pad], { ghost: true }),
    point([minX - pad, (minY + maxY) / 2], { ghost: true }),
    point([maxX + pad, (minY + maxY) / 2], { ghost: true }),
  ];

  const diagram = voronoi(
    featureCollection([...seeds, ...ghostPoints] as Feature<
      Point,
      { macroZone?: string; ghost?: boolean }
    >[]),
    {
      bbox: [minX - pad, minY - pad, maxX + pad, maxY + pad],
    },
  );

  const zoneMap = new Map<string, Feature<Polygon | MultiPolygon>>();

  for (const geo of GEO_ZONES) {
    const seed = point([geo.lng, geo.lat], { macroZone: geo.zone });
    let cell =
      diagram.features.find((feature) => feature.properties?.macroZone === geo.zone) ?? null;

    if (!cell) {
      cell =
        diagram.features.find(
          (feature) =>
            !feature.properties?.ghost &&
            feature.geometry?.type === "Polygon" &&
            booleanPointInPolygon(seed, feature as Feature<Polygon>),
        ) ?? null;
    }

    if (!cell?.geometry || cell.geometry.type !== "Polygon") {
      zoneMap.set(geo.zone, buildCircleZoneFeature(geo.zone));
      continue;
    }

    const clipped = intersect(featureCollection([cell as Feature<Polygon>, cityBoundary]));
    if (!clipped?.geometry) {
      zoneMap.set(geo.zone, buildCircleZoneFeature(geo.zone));
      continue;
    }

    const simplified = simplifyFeature(clipped as Feature<Polygon | MultiPolygon>);
    simplified.properties = {
      zone: geo.zone,
      sources: ["GEO_ZONES:voronoi", "OSM:city-boundary"],
    };
    zoneMap.set(geo.zone, simplified);
  }

  return zoneMap;
}

async function main() {
  const nominatimFeatures = SKIP_OSM ? [] : await fetchNominatimFeatures();
  const overpassFeatures = SKIP_OSM ? [] : await fetchOverpassFeatures();
  const istatFeatures = SKIP_OSM ? [] : await fetchIstatFeatures();

  let voronoiByZone = new Map<string, Feature<Polygon | MultiPolygon>>();
  if (!CIRCLES_ONLY) {
    console.log("Building Voronoi macro-zones clipped to city boundary…");
    const cityBoundary = await fetchCityBoundary();
    voronoiByZone = buildVoronoiZoneMap(cityBoundary);
    console.log(`  Voronoi zones: ${voronoiByZone.size}`);
  }

  const allFeatures = [...nominatimFeatures, ...overpassFeatures];
  const byZone = new Map<string, Feature<Polygon | MultiPolygon>[]>();
  const sourcesByZone = new Map<string, string[]>();

  const addFeature = (feature: Feature<Polygon | MultiPolygon>) => {
    const macroZone = feature.properties?.macroZone as string;
    if (!macroZone) return;
    const bucket = byZone.get(macroZone) ?? [];
    bucket.push(feature);
    byZone.set(macroZone, bucket);
    const sources = sourcesByZone.get(macroZone) ?? [];
    const source = feature.properties?.source as string;
    if (source && !sources.includes(source)) sources.push(source);
    sourcesByZone.set(macroZone, sources);
  };

  for (const feature of allFeatures) addFeature(feature);

  const outputFeatures: Feature<Polygon | MultiPolygon>[] = [];
  const report: string[] = [];

  for (const macroZone of zoneMapping.macroZones) {
    let zoneFeatures = byZone.get(macroZone) ?? [];

    if (!zoneFeatures.length) {
      const istatForZone = istatFeatures.filter((f) => f.properties?.macroZone === macroZone);
      if (istatForZone.length) {
        zoneFeatures = istatForZone;
        for (const f of istatForZone) addFeature(f);
        report.push(`${macroZone}: ISTAT fallback (${istatForZone.length})`);
      }
    } else {
      const sourceTypes = new Set(zoneFeatures.map((f) => String(f.properties?.source).split(":")[1]));
      report.push(`${macroZone}: OSM (${zoneFeatures.length} parts, ${[...sourceTypes].join("+")})`);
    }

    if (!zoneFeatures.length) {
      const voronoiZone = voronoiByZone.get(macroZone);
      if (voronoiZone) {
        report.push(`${macroZone}: Voronoi partition`);
        outputFeatures.push(voronoiZone);
        continue;
      }
      report.push(`${macroZone}: MISSING -> circle fallback`);
      outputFeatures.push(buildCircleZoneFeature(macroZone));
      continue;
    }

    const merged = unionFeatures(zoneFeatures);
    if (!merged || isOversizedPolygon(merged.geometry)) {
      const voronoiZone = voronoiByZone.get(macroZone);
      if (voronoiZone) {
        report.push(`${macroZone}: invalid OSM union -> Voronoi partition`);
        outputFeatures.push(voronoiZone);
        continue;
      }
      report.push(`${macroZone}: invalid union -> circle fallback`);
      outputFeatures.push(buildCircleZoneFeature(macroZone));
      continue;
    }

    const simplified = simplifyFeature(merged);
    simplified.properties = {
      zone: macroZone,
      sources: sourcesByZone.get(macroZone) ?? [],
    };
    outputFeatures.push(simplified);
  }

  const collection: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: outputFeatures,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(collection)}\n`);

  console.log(`\nWrote ${outputFeatures.length}/${zoneMapping.macroZones.length} zones -> ${OUTPUT_PATH}`);
  console.log("\nCoverage report:");
  for (const line of report) console.log(`  ${line}`);

  if (outputFeatures.length < zoneMapping.macroZones.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
