import { citySlugVariants, geocodeCity, normalizeCitySlug } from "./geocode";

const REGION_SLUGS: Record<string, string> = {
  abruzzo: "abruzzo",
  basilicata: "basilicata",
  calabria: "calabria",
  campania: "campania",
  emilia_romagna: "emilia-romagna",
  emilia: "emilia-romagna",
  friuli_venezia_giulia: "friuli-venezia-giulia",
  friuli: "friuli-venezia-giulia",
  lazio: "lazio",
  liguria: "liguria",
  lombardia: "lombardia",
  lombardy: "lombardia",
  marche: "marche",
  molise: "molise",
  piemonte: "piemonte",
  piedmont: "piemonte",
  puglia: "puglia",
  apulia: "puglia",
  sardegna: "sardegna",
  sardinia: "sardegna",
  sicilia: "sicilia",
  sicily: "sicilia",
  toscana: "toscana",
  tuscany: "toscana",
  trentino_alto_adige: "trentino-alto-adige",
  trentino: "trentino-alto-adige",
  umbria: "umbria",
  valle_d_aosta: "valle-d-aosta",
  aosta: "valle-d-aosta",
  veneto: "veneto",
};

const CITY_REGION_OVERRIDES: Record<string, string> = {
  bolzano: "trentino-alto-adige",
  merano: "trentino-alto-adige",
  aosta: "valle-d-aosta",
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function regionToSlug(region?: string): string | null {
  if (!region) return null;
  const key = region
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return REGION_SLUGS[key] ?? slugify(region);
}

export interface MercatoLocation {
  city: string;
  region: string;
  region_slug: string;
  city_slug: string;
  mercato_url: string;
  city_id?: string;
  lat: number;
  lng: number;
}

export function buildMercatoUrl(regionSlug: string, citySlug: string): string {
  return `https://www.immobiliare.it/mercato-immobiliare/${regionSlug}/${citySlug}/`;
}

export async function resolveMercatoLocation(city: string): Promise<MercatoLocation> {
  const geo = await geocodeCity(city);
  const citySlug = citySlugVariants(city).find((s) => s.includes("-")) ?? slugify(city);
  const cityKey = normalizeCitySlug(city);
  const regionSlug =
    CITY_REGION_OVERRIDES[cityKey] ?? regionToSlug(geo.region) ?? slugify(geo.region ?? "italia");

  if (!regionSlug) {
    throw new Error(`Regione non trovata per ${city}`);
  }

  return {
    city: city.trim(),
    region: geo.region ?? regionSlug,
    region_slug: regionSlug,
    city_slug: citySlug,
    mercato_url: buildMercatoUrl(regionSlug, citySlug),
    lat: geo.lat,
    lng: geo.lng,
  };
}

export function parseGeographyFromRsc(html: string): Partial<MercatoLocation> | null {
  const match = html.match(
    /"geography":\{"id":"([^"]+)","label":"([^"]+)"[\s\S]*?"slug":"([^"]+)"[\s\S]*?"parents":\[([\s\S]*?)\]/,
  );
  if (!match) return null;

  const [, cityId, label, citySlug, parentsRaw] = match;
  const regionMatch = parentsRaw.match(/\{"id":"[^"]+","label":"([^"]+)","level":"region"/);
  const regionLabel = regionMatch?.[1];
  const regionSlug = regionLabel ? regionToSlug(regionLabel) : null;

  if (!regionSlug) return null;

  return {
    city: label,
    region: regionLabel ?? regionSlug,
    region_slug: regionSlug,
    city_slug: citySlug,
    city_id: cityId,
    mercato_url: buildMercatoUrl(regionSlug, citySlug),
  };
}
