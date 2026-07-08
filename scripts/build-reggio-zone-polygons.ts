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
import { featureCollection } from "@turf/helpers";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
// @ts-expect-error shapefile has no types
import * as shapefile from "shapefile";
import zoneMapping from "../lib/occupancy/reggio-zone-mapping.json";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "lib/occupancy/data/zone-polygons.json");
const ISTAT_GIS_DIR = path.join(ROOT, "data/gis/ASC_21");
const REGGIO_ISTAT_CODE = "080063";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RealEstateExpert/1.0 (occupancy zone builder)";

const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const OVERPASS_QUERY = `
[out:json][timeout:90];
area["name"="Reggio di Calabria"]["admin_level"="8"]->.city;
(
  relation(area.city)["place"~"suburb|neighbourhood|quarter"];
  way(area.city)["place"~"suburb|neighbourhood|quarter"];
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

async function fetchNominatimPolygon(
  suburb: string,
  macroZone: string,
): Promise<Feature<Polygon | MultiPolygon> | null> {
  const params = new URLSearchParams({
    city: "Reggio Calabria",
    suburb,
    format: "geojson",
    polygon_geojson: "1",
    limit: "1",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as FeatureCollection;
  const feature = payload.features?.[0];
  if (!feature?.geometry) return null;

  const geomType = feature.geometry.type;
  if (geomType !== "Polygon" && geomType !== "MultiPolygon") return null;

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
      if (feature) features.push(feature);
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

async function main() {
  const nominatimFeatures = await fetchNominatimFeatures();
  const overpassFeatures = await fetchOverpassFeatures();
  const istatFeatures = await fetchIstatFeatures();

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
      report.push(`${macroZone}: MISSING`);
      continue;
    }

    const merged = unionFeatures(zoneFeatures);
    if (!merged) {
      report.push(`${macroZone}: union failed`);
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
