const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export class GeocodeError extends Error {}

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
  const variants = [slug];
  if (!slug.includes("-") && !slug.includes("_")) variants.push(`${slug}-${slug}`);
  return variants;
}

export async function geocodeCity(city: string): Promise<{ lat: number; lng: number; display_name?: string }> {
  const params = new URLSearchParams({
    q: `${city}, Italy`,
    format: "json",
    limit: "1",
    countrycodes: "it",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": "RealEstateExpert/0.1" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new GeocodeError(`Geocoding failed: ${response.status}`);

  const results = (await response.json()) as { lat: string; lon: string; display_name?: string }[];
  if (!results.length) throw new GeocodeError(`Città non trovata: ${city}`);

  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    display_name: results[0].display_name,
  };
}
