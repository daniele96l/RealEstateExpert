import type { MapListing } from "./types";

export interface SimilarListingCriteria {
  city: string;
  sqm: number | null;
  rooms: number | null;
  zone: string | null;
}

export function scoreSimilarity(listing: MapListing, criteria: SimilarListingCriteria): number {
  let score = 0;

  if (criteria.sqm != null && listing.sqm != null && criteria.sqm > 0) {
    const diffPct = Math.abs(listing.sqm - criteria.sqm) / criteria.sqm;
    if (diffPct <= 0.1) score += 45;
    else if (diffPct <= 0.2) score += 30;
    else if (diffPct <= 0.3) score += 10;
  } else if (criteria.sqm == null || listing.sqm == null) {
    score += 5;
  }

  if (criteria.rooms != null && listing.rooms != null) {
    const diff = Math.abs(listing.rooms - criteria.rooms);
    if (diff === 0) score += 35;
    else if (diff === 1) score += 18;
  }

  if (criteria.zone) {
    const zone = criteria.zone.toLowerCase();
    const hay = `${listing.title} ${listing.address ?? ""}`.toLowerCase();
    if (hay.includes(zone)) score += 20;
  }

  return score;
}

export function filterSimilarRentals(
  listings: MapListing[],
  criteria: SimilarListingCriteria,
  minScore = 25,
  limit = 8,
): MapListing[] {
  return listings
    .filter((l) => l.operation === "rent")
    .map((listing) => ({ listing, score: scoreSimilarity(listing, criteria) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score || a.listing.price - b.listing.price)
    .slice(0, limit)
    .map(({ listing }) => listing);
}

export function criteriaFromDetail(
  detail: {
    city_label: string | null;
    zone: string | null;
    sqm: number | null;
    rooms: number | null;
  },
  mapCity?: string | null,
): SimilarListingCriteria {
  return {
    city: mapCity?.trim() || detail.city_label?.trim() || "Reggio Calabria",
    sqm: detail.sqm,
    rooms: detail.rooms,
    zone: detail.zone,
  };
}
