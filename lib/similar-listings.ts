import type { MapListing } from "./types";

export interface SimilarListingCriteria {
  city: string;
  zone: string | null;
  lat: number | null;
  lng: number | null;
}

/** Max distance for “stessa zona” when coordinates are available. */
const SIMILAR_RADIUS_M = 2_500;

function listingHaystack(listing: MapListing): string {
  return `${listing.title} ${listing.address ?? ""}`.toLowerCase();
}

function inferZoneFromAddress(address: string | null): string | null {
  if (!address?.trim()) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const zone = parts[parts.length - 2];
  if (zone && zone.length > 3 && !/^\d+$/.test(zone)) return zone;
  return null;
}

function stripCityFromZone(zone: string, city?: string | null): string {
  let z = zone.trim();
  z = z.replace(/,\s*reggio(\s+di)?\s+calabria.*$/i, "").trim();
  if (city?.trim()) {
    const escaped = city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    z = z.replace(new RegExp(`,\\s*${escaped}\\s*$`, "i"), "").trim();
  }
  return z;
}

function zoneSegments(zone: string, city?: string | null): string[] {
  const normalized = stripCityFromZone(zone, city);
  return normalized
    .split(/[-,]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4 && !/^reggio/i.test(s) && !/^\d+$/.test(s));
}

export function zoneMatchScore(
  listing: MapListing,
  zone: string,
  city?: string | null,
): number {
  const hay = listingHaystack(listing);
  const normalizedZone = stripCityFromZone(zone, city).toLowerCase();
  if (!normalizedZone) return 0;
  if (hay.includes(normalizedZone)) return 100;

  const segments = zoneSegments(zone, city);
  if (!segments.length) return 0;

  let matched = 0;
  for (const seg of segments) {
    if (hay.includes(seg.toLowerCase())) matched++;
  }
  if (matched === 0) return 0;
  return Math.round((matched / segments.length) * 80);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function geoMatchScore(
  listing: MapListing,
  criteria: Pick<SimilarListingCriteria, "lat" | "lng">,
): number {
  if (
    criteria.lat == null ||
    criteria.lng == null ||
    !Number.isFinite(criteria.lat) ||
    !Number.isFinite(criteria.lng) ||
    listing.lat == null ||
    listing.lng == null ||
    (listing.lat === 0 && listing.lng === 0)
  ) {
    return 0;
  }

  const distance = haversineMeters(criteria.lat, criteria.lng, listing.lat, listing.lng);
  if (distance > SIMILAR_RADIUS_M) return 0;
  return Math.round(100 * (1 - distance / SIMILAR_RADIUS_M));
}

export function similarMatchScore(listing: MapListing, criteria: SimilarListingCriteria): number {
  const zoneScore = criteria.zone ? zoneMatchScore(listing, criteria.zone, criteria.city) : 0;
  const geoScore = geoMatchScore(listing, criteria);
  return Math.max(zoneScore, geoScore);
}

export function filterSimilarRentals(
  listings: MapListing[],
  criteria: SimilarListingCriteria,
  limit = 12,
): MapListing[] {
  const rent = listings.filter((l) => l.operation === "rent");
  if (!criteria.zone && (criteria.lat == null || criteria.lng == null)) return [];

  return rent
    .map((listing) => ({
      listing,
      score: similarMatchScore(listing, criteria),
      distance:
        criteria.lat != null && criteria.lng != null && listing.lat && listing.lng
          ? haversineMeters(criteria.lat, criteria.lng, listing.lat, listing.lng)
          : Number.POSITIVE_INFINITY,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.distance - b.distance || a.listing.price - b.listing.price)
    .slice(0, limit)
    .map(({ listing }) => listing);
}

export function criteriaFromDetail(
  detail: {
    city_label: string | null;
    zone: string | null;
    address: string | null;
    lat: number;
    lng: number;
  },
  mapCity?: string | null,
): SimilarListingCriteria {
  const city = mapCity?.trim() || detail.city_label?.trim() || "Reggio Calabria";
  const rawZone = detail.zone?.trim() || inferZoneFromAddress(detail.address);
  return {
    city,
    zone: rawZone ? stripCityFromZone(rawZone, city) : null,
    lat: detail.lat && Number.isFinite(detail.lat) ? detail.lat : null,
    lng: detail.lng && Number.isFinite(detail.lng) ? detail.lng : null,
  };
}
