import type { MapListing } from "./types";
import { normalizeListingCondition } from "./listing-condition-enrich";
import { filterListingsByRadius, filterListingsByPolygon, isValidPolygon, type GeoPoint, type GeoPolygon } from "./geo-filter";
import {
  CONDITION_FILTER_OPTIONS,
  matchesConditionFilter,
  type ConditionFilter,
} from "./property-condition";

export type { ConditionFilter };
export { CONDITION_FILTER_OPTIONS };

export type AreaFilterPreset = "off" | "centro" | "quartiere" | "custom" | "polygon";

export interface ListingsFilters {
  salePriceMin: number | null;
  salePriceMax: number | null;
  rentPriceMin: number | null;
  rentPriceMax: number | null;
  sqmMin: number | null;
  sqmMax: number | null;
  rooms: number | null;
  propertyType: string | null;
  condition: ConditionFilter;
  areaPreset: AreaFilterPreset;
  areaRadiusM: number | null;
  areaLat: number | null;
  areaLng: number | null;
  areaPolygon: GeoPolygon | null;
}

export const EMPTY_LISTINGS_FILTERS: ListingsFilters = {
  salePriceMin: null,
  salePriceMax: 100_000,
  rentPriceMin: null,
  rentPriceMax: null,
  sqmMin: null,
  sqmMax: 100,
  rooms: null,
  propertyType: null,
  condition: "any",
  areaPreset: "off",
  areaRadiusM: 2_500,
  areaLat: null,
  areaLng: null,
  areaPolygon: null,
};

export const PROPERTY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "flat", label: "Appartamento" },
  { value: "studio", label: "Monolocale" },
  { value: "duplex", label: "Duplex" },
  { value: "penthouse", label: "Attico" },
  { value: "chalet", label: "Villa / chalet" },
  { value: "countryHouse", label: "Casa di campagna" },
];

export const ROOMS_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5+" },
];

export function hasActiveFilters(filters: ListingsFilters): boolean {
  return (
    filters.areaPreset !== "off" ||
    filters.condition !== "any" ||
    Object.entries(filters).some(([key, v]) => {
      if (
        key === "areaPreset" ||
        key === "areaRadiusM" ||
        key === "areaLat" ||
        key === "areaLng" ||
        key === "areaPolygon" ||
        key === "condition"
      ) {
        return false;
      }
      return v != null;
    })
  );
}

export function resolveAreaFilterRadius(filters: ListingsFilters): number | null {
  if (filters.areaPreset === "off" || filters.areaPreset === "polygon") return null;
  if (filters.areaPreset === "centro") return 1_000;
  if (filters.areaPreset === "quartiere") return 2_500;
  return filters.areaRadiusM != null && filters.areaRadiusM > 0 ? filters.areaRadiusM : 2_500;
}

export function resolveAreaFilterCenter(
  filters: ListingsFilters,
  fallback: GeoPoint | null,
): GeoPoint | null {
  if (filters.areaPreset === "off") return null;
  if (filters.areaLat != null && filters.areaLng != null) {
    return { lat: filters.areaLat, lng: filters.areaLng };
  }
  return fallback;
}

function matchesRooms(rooms: number | null, filter: number | null): boolean {
  if (filter == null) return true;
  if (rooms == null) return false;
  if (filter >= 5) return rooms >= 5;
  return rooms === filter;
}

function matchesPrice(listing: MapListing, filters: ListingsFilters): boolean {
  if (listing.operation === "sale") {
    if (filters.salePriceMin != null && listing.price < filters.salePriceMin) return false;
    if (filters.salePriceMax != null && listing.price > filters.salePriceMax) return false;
    return true;
  }
  if (filters.rentPriceMin != null && listing.price < filters.rentPriceMin) return false;
  if (filters.rentPriceMax != null && listing.price > filters.rentPriceMax) return false;
  return true;
}

export function filterListings(
  listings: MapListing[],
  filters: ListingsFilters,
  mapCenter?: GeoPoint | null,
): MapListing[] {
  let result = listings.map(normalizeListingCondition).filter((listing) => {
    if (!matchesPrice(listing, filters)) return false;
    if (filters.sqmMin != null && (listing.sqm == null || listing.sqm < filters.sqmMin)) return false;
    if (filters.sqmMax != null && (listing.sqm == null || listing.sqm > filters.sqmMax)) return false;
    if (!matchesRooms(listing.rooms, filters.rooms)) return false;
    if (filters.propertyType && listing.property_type !== filters.propertyType) return false;
    if (!matchesConditionFilter(listing, filters.condition)) return false;
    return true;
  });

  const areaCenter = resolveAreaFilterCenter(filters, mapCenter ?? null);
  const areaRadius = resolveAreaFilterRadius(filters);
  if (filters.areaPreset === "polygon" && isValidPolygon(filters.areaPolygon)) {
    result = filterListingsByPolygon(result, filters.areaPolygon);
  } else if (areaCenter && areaRadius != null) {
    result = filterListingsByRadius(result, areaCenter, areaRadius);
  }

  return result;
}

export function parseFilterNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;

  const suffixMatch = trimmed.match(/^(\d+(?:\.\d+)?)([kKmM])?$/);
  if (suffixMatch) {
    const base = Number(suffixMatch[1]);
    if (!Number.isFinite(base) || base < 0) return null;
    const suffix = suffixMatch[2]?.toLowerCase();
    if (suffix === "k") return Math.round(base * 1_000);
    if (suffix === "m") return Math.round(base * 1_000_000);
    return base;
  }

  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
