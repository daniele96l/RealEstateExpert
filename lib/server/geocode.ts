import { getMarket, type MarketId } from "@/lib/markets";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export class GeocodeError extends Error {}

export function locationMatchesCity(locationName: string, city: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const nName = norm(locationName);
  const nCity = norm(city);
  if (nName.includes(nCity) || nCity.includes(nName)) return true;
  return nCity.split(" ").every((part) => part.length > 2 && nName.includes(part));
}

export function normalizeCitySlug(city: string): string {
  const slug = city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || city.trim().toLowerCase().replace(/\s+/g, "_");
}

export function citySlugVariants(city: string): string[] {
  const slug = normalizeCitySlug(city);
  const set = new Set<string>();

  if (slug.includes("_")) {
    set.add(slug.replace(/_/g, "-"));
    set.add(slug);
  } else {
    set.add(slug);
    set.add(`${slug}-${slug}`);
  }

  const aliases: Record<string, string[]> = {
    reggio_calabria: ["reggio-calabria"],
    reggio_emilia: ["reggio-emilia"],
    la_spezia: ["la-spezia"],
    reggio_nell_emilia: ["reggio-emilia"],
  };
  for (const v of aliases[slug] ?? []) set.add(v);

  return [...set];
}

type NominatimResult = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    region?: string;
  };
};

export async function geocodeCity(
  city: string,
  market: MarketId = "it",
): Promise<{ lat: number; lng: number; display_name?: string; region?: string }> {
  const cfg = getMarket(market);
  const params = new URLSearchParams({
    q: `${city}, ${cfg.geocodeCountry}`,
    format: "json",
    limit: "1",
    countrycodes: cfg.geocodeCountryCodes,
    addressdetails: "1",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": "RealEstateExpert/0.1" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new GeocodeError(`Geocoding failed: ${response.status}`);

  const results = (await response.json()) as NominatimResult[];
  if (!results.length) throw new GeocodeError(`Città non trovata: ${city}`);

  const addr = results[0].address;
  const region = addr?.state ?? addr?.region;

  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    display_name: results[0].display_name,
    region,
  };
}
