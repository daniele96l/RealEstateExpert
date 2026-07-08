import { distanceMeters } from "@/lib/geo-filter";
import { pointInReggioMacroZone } from "./reggio-zone-polygons";
import { OCCUPANCY_FALLBACK_ZONE } from "./constants";
import { GEO_ZONES, REGGIO_MACRO_ZONES, type ReggioMacroZone } from "./reggio-zone-geo";

export { GEO_ZONES, REGGIO_MACRO_ZONES, type ReggioMacroZone };

const KEYWORD_RULES: Array<{ zone: ReggioMacroZone; pattern: RegExp }> = [
  { zone: REGGIO_MACRO_ZONES.SANTA_CATERINA, pattern: /pentimele|santa\s*caterina|san\s*brunello|\bvito\b|nervesa/i },
  { zone: REGGIO_MACRO_ZONES.PELLARO, pattern: /pellaro|san\s*gregorio|occhio\s*di\s*pellaro|san\s*leo/i },
  { zone: REGGIO_MACRO_ZONES.RAVAGNESE, pattern: /ravagnese|arangea|gallina|\barmo\b/i },
  { zone: REGGIO_MACRO_ZONES.ARCHI, pattern: /gallico|catona|sambatello|\barchi\b/i },
  {
    zone: REGGIO_MACRO_ZONES.TRABOCHETTO,
    pattern: /trabocchetto|spirito\s*santo|tremulini|\beremo\b|condera/i,
  },
  { zone: REGGIO_MACRO_ZONES.FERROVIERI, pattern: /ferrovieri|\bstadio\b|sbarre|gebbione|rione\s*ferrovieri/i },
  { zone: REGGIO_MACRO_ZONES.CENTRO, pattern: /centro\s*storico|pineta\s*zerbi|\bcentro\b|reggio\s*nord/i },
  { zone: REGGIO_MACRO_ZONES.TERRETI, pattern: /terreti|ortì|\borti\b/i },
  { zone: REGGIO_MACRO_ZONES.MODENA, pattern: /san\s*giorgio|san\s*sperato|\bmodena\b|santo\s*stefano/i },
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function extractZoneSegment(address: string): string | null {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1]!;
  if (/reggio(\s+di)?\s+calabria/i.test(last) && parts.length >= 2) {
    return parts[parts.length - 2]!;
  }

  if (/^\d+[\/\w]*$/.test(last) && parts.length === 2) {
    return null;
  }

  return null;
}

function matchKeywordZone(text: string): ReggioMacroZone | null {
  const normalized = normalizeText(text);
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(normalized)) return rule.zone;
  }
  return null;
}

function matchGeoZone(lat: number, lng: number): ReggioMacroZone | null {
  const polygonZone = pointInReggioMacroZone(lat, lng);
  if (polygonZone) return polygonZone as ReggioMacroZone;

  let best: { zone: ReggioMacroZone; distance: number } | null = null;

  for (const candidate of GEO_ZONES) {
    const distance = distanceMeters({ lat, lng }, { lat: candidate.lat, lng: candidate.lng });
    if (distance > candidate.maxM) continue;
    if (!best || distance < best.distance) {
      best = { zone: candidate.zone, distance };
    }
  }

  return best?.zone ?? null;
}

export function resolveReggioCalabriaZone(
  address: string | null,
  lat?: number | null,
  lng?: number | null,
): string {
  const segments = [extractZoneSegment(address ?? ""), address ?? ""].filter(
    (segment): segment is string => Boolean(segment),
  );
  for (const segment of segments) {
    const matched = matchKeywordZone(segment);
    if (matched) return matched;
  }

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const geo = matchGeoZone(lat, lng);
    if (geo) return geo;
  }

  return OCCUPANCY_FALLBACK_ZONE;
}
