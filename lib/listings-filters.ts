import type { MapListing } from "./types";
import { inferListingWebsiteSource, type ListingSource } from "./listing-url";
import { normalizeListingCondition } from "./listing-condition-enrich";
import { filterListingsByRadius, filterListingsByPolygon, isValidPolygon, type GeoPoint, type GeoPolygon } from "./geo-filter";
import {
  CONDITION_FILTER_OPTIONS,
  matchesConditionFilter,
  type ConditionFilter,
} from "./property-condition";
import { matchesCzechRoomLayout } from "./czech-room-layout";

export type { ConditionFilter };
export { CONDITION_FILTER_OPTIONS };

export type AreaFilterPreset = "off" | "centro" | "quartiere" | "custom" | "polygon";

export type ListingSourceFilter = ListingSource | "all";

export interface ListingsFilters {
  source: ListingSourceFilter;
  salePriceMin: number | null;
  salePriceMax: number | null;
  rentPriceMin: number | null;
  rentPriceMax: number | null;
  sqmMin: number | null;
  sqmMax: number | null;
  rooms: number | null;
  roomLayout: string | null;
  propertyType: string | null;
  condition: ConditionFilter;
  areaPreset: AreaFilterPreset;
  areaRadiusM: number | null;
  areaLat: number | null;
  areaLng: number | null;
  areaPolygon: GeoPolygon | null;
}

export const LISTING_SOURCE_OPTIONS: { value: ListingSourceFilter; label: string }[] = [
  { value: "all", label: "Tutte le fonti" },
  { value: "idealista", label: "Idealista" },
  { value: "immobiliare", label: "Immobiliare.it" },
  { value: "sreality", label: "Sreality.cz" },
];

export function listingSourceOptionsForMarket(market: "it" | "cz") {
  if (market === "cz") {
    return [{ value: "all" as const, label: "Tutte le fonti" }, { value: "sreality" as const, label: "Sreality.cz" }];
  }
  return LISTING_SOURCE_OPTIONS.filter((o) => o.value !== "sreality");
}

export const EMPTY_LISTINGS_FILTERS: ListingsFilters = {
  source: "all",
  salePriceMin: null,
  salePriceMax: 100_000,
  rentPriceMin: null,
  rentPriceMax: null,
  sqmMin: null,
  sqmMax: 100,
  rooms: null,
  roomLayout: null,
  propertyType: null,
  condition: "any",
  areaPreset: "off",
  areaRadiusM: 2_500,
  areaLat: null,
  areaLng: null,
  areaPolygon: null,
};

export function emptyListingsFilters(market: "it" | "cz" = "it"): ListingsFilters {
  if (market === "cz") {
    return {
      ...EMPTY_LISTINGS_FILTERS,
      salePriceMax: null,
      rentPriceMax: null,
      sqmMax: null,
    };
  }
  return { ...EMPTY_LISTINGS_FILTERS };
}

export const PROPERTY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "flat", label: "Appartamento" },
  { value: "studio", label: "Monolocale" },
  { value: "duplex", label: "Duplex" },
  { value: "penthouse", label: "Attico" },
  { value: "chalet", label: "Villa / chalet" },
  { value: "countryHouse", label: "Casa di campagna" },
];

export const PROPERTY_TYPE_OPTIONS_CZ: { value: string; label: string }[] = [
  { value: "flat", label: "Byt" },
  { value: "room", label: "Pokoj" },
];

export function propertyTypeOptionsForMarket(market: "it" | "cz") {
  return market === "cz" ? PROPERTY_TYPE_OPTIONS_CZ : PROPERTY_TYPE_OPTIONS;
}

export const ROOMS_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5+" },
];

export const SALE_PRICE_PRESETS_IT = [
  50_000, 100_000, 150_000, 200_000, 300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000,
  3_000_000,
];

export const SALE_PRICE_PRESETS_CZ = [
  2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 8_000_000, 10_000_000, 12_000_000,
  15_000_000, 20_000_000,
];

export const RENT_PRICE_PRESETS_IT = [
  300, 400, 500, 600, 700, 800, 1_000, 1_200, 1_500, 2_000, 2_500, 3_000,
];

export const RENT_PRICE_PRESETS_CZ = [
  8_000, 10_000, 12_000, 14_000, 16_000, 18_000, 20_000, 25_000, 30_000, 35_000, 40_000,
];

export const SQM_PRESETS = [25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 200];

export function filterSelectOptions(options: number[], current: number | null): number[] {
  if (current == null || options.includes(current)) return options;
  return [...options, current].sort((a, b) => a - b);
}

export function salePricePresetsForMarket(market: "it" | "cz"): number[] {
  return market === "cz" ? SALE_PRICE_PRESETS_CZ : SALE_PRICE_PRESETS_IT;
}

export function rentPricePresetsForMarket(market: "it" | "cz"): number[] {
  return market === "cz" ? RENT_PRICE_PRESETS_CZ : RENT_PRICE_PRESETS_IT;
}

export function hasActiveFilters(filters: ListingsFilters): boolean {
  return (
    filters.source !== "all" ||
    filters.areaPreset !== "off" ||
    filters.condition !== "any" ||
    Object.entries(filters).some(([key, v]) => {
      if (
        key === "source" ||
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
    if (filters.source !== "all") {
      const listingSource = inferListingWebsiteSource(listing);
      if (listingSource !== filters.source) return false;
    }
    if (!matchesPrice(listing, filters)) return false;
    if (filters.sqmMin != null && (listing.sqm == null || listing.sqm < filters.sqmMin)) return false;
    if (filters.sqmMax != null && (listing.sqm == null || listing.sqm > filters.sqmMax)) return false;
    if (filters.roomLayout != null) {
      if (!matchesCzechRoomLayout(listing, filters.roomLayout)) return false;
    } else if (!matchesRooms(listing.rooms, filters.rooms)) {
      return false;
    }
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
