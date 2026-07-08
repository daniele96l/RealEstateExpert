import { distanceMeters } from "./geo-filter";
import {
  passesSimilarRentCharacteristicFilters,
  type SimilarRentSearchOptions,
} from "./similar-rent-filters";
import type { MapListing } from "./types";

export interface SimilarListingCriteria {
  city: string;
  zone: string | null;
  lat: number | null;
  lng: number | null;
}

/** Max distance for “stessa zona” when coordinates are available. */
const SIMILAR_RADIUS_M = 1_000;

function listingHaystack(listing: MapListing): string {
  return `${listing.title} ${listing.address ?? ""}`.toLowerCase();
}

export function inferZoneFromAddress(address: string | null): string | null {
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

export function geoMatchScore(
  listing: MapListing,
  criteria: Pick<SimilarListingCriteria, "lat" | "lng">,
  radiusM: number | null = SIMILAR_RADIUS_M,
): number {
  if (radiusM == null || radiusM <= 0) return 0;
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

  const distance = distanceMeters(
    { lat: criteria.lat, lng: criteria.lng },
    { lat: listing.lat, lng: listing.lng },
  );
  if (distance > radiusM) return 0;
  return Math.round(100 * (1 - distance / radiusM));
}

export function similarMatchScore(
  listing: MapListing,
  criteria: SimilarListingCriteria,
  radiusM: number | null = SIMILAR_RADIUS_M,
): number {
  const zoneScore = criteria.zone ? zoneMatchScore(listing, criteria.zone, criteria.city) : 0;
  const geoScore = geoMatchScore(listing, criteria, radiusM);
  return Math.max(zoneScore, geoScore);
}

export function filterSimilarRentals(
  listings: MapListing[],
  criteria: SimilarListingCriteria,
  searchOptions?: Partial<SimilarRentSearchOptions>,
): MapListing[] {
  const rent = listings.filter((l) => l.operation === "rent");
  if (!criteria.zone && (criteria.lat == null || criteria.lng == null)) return [];

  const radiusM = searchOptions?.radiusM ?? SIMILAR_RADIUS_M;
  const limit = searchOptions?.limit !== undefined ? searchOptions.limit : 12;
  const charOptions: SimilarRentSearchOptions = {
    radiusM,
    limit,
    saleRooms: searchOptions?.saleRooms ?? null,
    saleSqm: searchOptions?.saleSqm ?? null,
    salePropertyType: searchOptions?.salePropertyType ?? null,
    roomsFilter: searchOptions?.roomsFilter ?? "any",
    roomsTolerance: searchOptions?.roomsTolerance ?? 1,
    sqmFilter: searchOptions?.sqmFilter ?? "any",
    sqmTolerancePct: searchOptions?.sqmTolerancePct ?? 25,
    propertyTypeFilter: searchOptions?.propertyTypeFilter ?? "any",
  };

  const scored = rent
    .map((listing) => ({
      listing,
      score: similarMatchScore(listing, criteria, radiusM),
      distance:
        criteria.lat != null && criteria.lng != null && listing.lat && listing.lng
          ? distanceMeters(
              { lat: criteria.lat, lng: criteria.lng },
              { lat: listing.lat, lng: listing.lng },
            )
          : Number.POSITIVE_INFINITY,
    }))
    .filter(({ listing }) => {
      if (!passesSimilarRentCharacteristicFilters(listing, charOptions)) return false;
      const hasSaleCoords =
        criteria.lat != null &&
        criteria.lng != null &&
        Number.isFinite(criteria.lat) &&
        Number.isFinite(criteria.lng);
      if (hasSaleCoords && radiusM != null && radiusM > 0) {
        return geoMatchScore(listing, criteria, radiusM) > 0;
      }
      return similarMatchScore(listing, criteria, radiusM) > 0;
    })
    .sort((a, b) => b.score - a.score || a.distance - b.distance || a.listing.price - b.listing.price);

  const capped = limit == null ? scored : scored.slice(0, limit);
  return capped.map(({ listing }) => listing);
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
