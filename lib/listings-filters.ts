import type { MapListing } from "./types";
import { filterListingsByRadius, type GeoPoint } from "./geo-filter";

export type AreaFilterPreset = "off" | "centro" | "quartiere" | "custom";

export interface ListingsFilters {
  salePriceMin: number | null;
  salePriceMax: number | null;
  rentPriceMin: number | null;
  rentPriceMax: number | null;
  sqmMin: number | null;
  sqmMax: number | null;
  rooms: number | null;
  propertyType: string | null;
  areaPreset: AreaFilterPreset;
  areaRadiusM: number | null;
  areaLat: number | null;
  areaLng: number | null;
}

export const EMPTY_LISTINGS_FILTERS: ListingsFilters = {
  salePriceMin: null,
  salePriceMax: null,
  rentPriceMin: null,
  rentPriceMax: null,
  sqmMin: null,
  sqmMax: null,
  rooms: null,
  propertyType: null,
  areaPreset: "off",
  areaRadiusM: 2_500,
  areaLat: null,
  areaLng: null,
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
    Object.entries(filters).some(([key, v]) => {
      if (key === "areaPreset" || key === "areaRadiusM" || key === "areaLat" || key === "areaLng") {
        return false;
      }
      return v != null;
    })
  );
}

export function resolveAreaFilterRadius(filters: ListingsFilters): number | null {
  if (filters.areaPreset === "off") return null;
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
  let result = listings.filter((listing) => {
    if (!matchesPrice(listing, filters)) return false;
    if (filters.sqmMin != null && (listing.sqm == null || listing.sqm < filters.sqmMin)) return false;
    if (filters.sqmMax != null && (listing.sqm == null || listing.sqm > filters.sqmMax)) return false;
    if (!matchesRooms(listing.rooms, filters.rooms)) return false;
    if (filters.propertyType && listing.property_type !== filters.propertyType) return false;
    return true;
  });

  const areaCenter = resolveAreaFilterCenter(filters, mapCenter ?? null);
  const areaRadius = resolveAreaFilterRadius(filters);
  if (areaCenter && areaRadius != null) {
    result = filterListingsByRadius(result, areaCenter, areaRadius);
  }

  return result;
}

export function parseFilterNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
