import { distanceMeters } from "@/lib/geo-filter";
import { pointInReggioMacroZone } from "./reggio-zone-polygons";
import { OCCUPANCY_FALLBACK_ZONE } from "./constants";

/** Immobiliare.it macro-areas for Reggio Calabria. */
export const REGGIO_MACRO_ZONES = {
  CENTRO: "Centro Storico, Pineta Zerbi",
  RAVAGNESE: "Ravagnese, Gallina, Armo",
  ARCHI: "Archi, Gallico, Catona",
  PELLARO: "San Gregorio, Pellaro",
  TERRETI: "Terreti, Ortì",
  TRABOCHETTO: "Trabocchetto, Spirito Santo, Tremulini, Eremo",
  SANTA_CATERINA: "Santa Caterina, San Brunello, Vito",
  FERROVIERI: "Ferrovieri, Stadio, Sbarre",
  MODENA: "Modena, San Giorgio Extra, San Sperato",
} as const;

export type ReggioMacroZone = (typeof REGGIO_MACRO_ZONES)[keyof typeof REGGIO_MACRO_ZONES];

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

export const GEO_ZONES: Array<{ zone: ReggioMacroZone; lat: number; lng: number; maxM: number }> = [
  { zone: REGGIO_MACRO_ZONES.PELLARO, lat: 38.005, lng: 15.655, maxM: 4_500 },
  { zone: REGGIO_MACRO_ZONES.ARCHI, lat: 38.075, lng: 15.638, maxM: 3_500 },
  { zone: REGGIO_MACRO_ZONES.CENTRO, lat: 38.111, lng: 15.648, maxM: 2_200 },
  { zone: REGGIO_MACRO_ZONES.TRABOCHETTO, lat: 38.108, lng: 15.662, maxM: 2_800 },
  { zone: REGGIO_MACRO_ZONES.FERROVIERI, lat: 38.096, lng: 15.642, maxM: 2_500 },
  { zone: REGGIO_MACRO_ZONES.SANTA_CATERINA, lat: 38.132, lng: 15.652, maxM: 3_500 },
  { zone: REGGIO_MACRO_ZONES.RAVAGNESE, lat: 38.155, lng: 15.645, maxM: 4_000 },
  { zone: REGGIO_MACRO_ZONES.MODENA, lat: 38.118, lng: 15.675, maxM: 3_500 },
  { zone: REGGIO_MACRO_ZONES.TERRETI, lat: 38.105, lng: 15.635, maxM: 2_500 },
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
