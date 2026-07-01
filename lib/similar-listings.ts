import type { MapListing } from "./types";

export interface SimilarListingCriteria {
  city: string;
  zone: string | null;
}

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

function zoneSegments(zone: string): string[] {
  return zone
    .split(/\s*-\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}

export function zoneMatchScore(listing: MapListing, zone: string): number {
  const hay = listingHaystack(listing);
  const normalizedZone = zone.toLowerCase().trim();
  if (!normalizedZone) return 0;
  if (hay.includes(normalizedZone)) return 100;

  const segments = zoneSegments(zone);
  if (!segments.length) return 0;

  let matched = 0;
  for (const seg of segments) {
    if (hay.includes(seg.toLowerCase())) matched++;
  }
  if (matched === 0) return 0;
  return Math.round((matched / segments.length) * 80);
}

export function filterSimilarRentals(
  listings: MapListing[],
  criteria: SimilarListingCriteria,
  limit = 12,
): MapListing[] {
  const rent = listings.filter((l) => l.operation === "rent");
  if (!criteria.zone) return [];

  return rent
    .map((listing) => ({ listing, score: zoneMatchScore(listing, criteria.zone!) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.listing.price - b.listing.price)
    .slice(0, limit)
    .map(({ listing }) => listing);
}

export function criteriaFromDetail(
  detail: {
    city_label: string | null;
    zone: string | null;
    address: string | null;
  },
  mapCity?: string | null,
): SimilarListingCriteria {
  return {
    city: mapCity?.trim() || detail.city_label?.trim() || "Reggio Calabria",
    zone: detail.zone?.trim() || inferZoneFromAddress(detail.address),
  };
}
