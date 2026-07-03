import type { MapListing } from "./types";
import type { SimilarRentEstimateMethod } from "./rent-price-basis";

export const SIMILAR_RENT_RADIUS_PRESETS = [
  { id: "500m", label: "0,5 km", radiusM: 500 },
  { id: "1km", label: "1 km", radiusM: 1_000 },
  { id: "2km", label: "2 km", radiusM: 2_000 },
  { id: "3km", label: "3 km", radiusM: 3_000 },
  { id: "5km", label: "5 km", radiusM: 5_000 },
  { id: "10km", label: "10 km", radiusM: 10_000 },
] as const;

export type SimilarRentRadiusPresetId = (typeof SIMILAR_RENT_RADIUS_PRESETS)[number]["id"];

export type SimilarRoomsFilter = "any" | "match" | "similar";
export type SimilarSqmFilter = "any" | "similar";
export type SimilarPropertyTypeFilter = "any" | "match";

export interface SimilarRentFilterState {
  radiusPresetId: SimilarRentRadiusPresetId;
  roomsFilter: SimilarRoomsFilter;
  sqmFilter: SimilarSqmFilter;
  propertyTypeFilter: SimilarPropertyTypeFilter;
  /** Max comparables shown; null = no cap */
  limit: number | null;
  rentEstimateMethod: SimilarRentEstimateMethod;
}

export const DEFAULT_SIMILAR_RENT_FILTERS: SimilarRentFilterState = {
  radiusPresetId: "1km",
  roomsFilter: "similar",
  sqmFilter: "any",
  propertyTypeFilter: "any",
  limit: null,
  rentEstimateMethod: "per_sqm",
};

export const SIMILAR_RENT_LIMIT_OPTIONS = [
  { value: 12, label: "12" },
  { value: 24, label: "24" },
  { value: 36, label: "36" },
  { value: 48, label: "48" },
  { value: null, label: "Tutti" },
] as const;

export function similarRentLimitSelectValue(limit: number | null): string {
  return limit == null ? "all" : String(limit);
}

export function similarRentLimitFromSelect(value: string): number | null {
  return value === "all" ? null : Number(value);
}

export interface SimilarRentSearchOptions {
  radiusM: number | null;
  limit: number | null;
  saleRooms: number | null;
  saleSqm: number | null;
  salePropertyType: string | null;
  roomsFilter: SimilarRoomsFilter;
  roomsTolerance: number;
  sqmFilter: SimilarSqmFilter;
  sqmTolerancePct: number;
  propertyTypeFilter: SimilarPropertyTypeFilter;
}

export function radiusMFromPreset(presetId: SimilarRentRadiusPresetId): number | null {
  const preset = SIMILAR_RENT_RADIUS_PRESETS.find((p) => p.id === presetId);
  return preset?.radiusM ?? 1_000;
}

export function radiusPresetFromMeters(radiusM: number): SimilarRentRadiusPresetId {
  const sorted = [...SIMILAR_RENT_RADIUS_PRESETS].sort((a, b) => a.radiusM - b.radiusM);
  const match =
    sorted.find((p) => p.radiusM >= radiusM) ?? sorted[sorted.length - 1];
  return match.id;
}

export function radiusPresetLabel(presetId: SimilarRentRadiusPresetId): string {
  return SIMILAR_RENT_RADIUS_PRESETS.find((p) => p.id === presetId)?.label ?? presetId;
}

export function similarRentSearchOptionsFromState(
  filters: SimilarRentFilterState,
  sale: Pick<MapListing, "rooms" | "sqm" | "property_type">,
): SimilarRentSearchOptions {
  return {
    radiusM: radiusMFromPreset(filters.radiusPresetId),
    limit: filters.limit,
    saleRooms: sale.rooms ?? null,
    saleSqm: sale.sqm ?? null,
    salePropertyType: sale.property_type ?? null,
    roomsFilter: filters.roomsFilter,
    roomsTolerance: 1,
    sqmFilter: filters.sqmFilter,
    sqmTolerancePct: 25,
    propertyTypeFilter: filters.propertyTypeFilter,
  };
}

export function passesSimilarRentCharacteristicFilters(
  listing: MapListing,
  options: SimilarRentSearchOptions,
): boolean {
  if (options.roomsFilter !== "any" && options.saleRooms != null) {
    if (listing.rooms == null) return false;
    if (options.roomsFilter === "match" && listing.rooms !== options.saleRooms) return false;
    if (
      options.roomsFilter === "similar" &&
      Math.abs(listing.rooms - options.saleRooms) > options.roomsTolerance
    ) {
      return false;
    }
  }

  if (options.sqmFilter === "similar" && options.saleSqm != null && options.saleSqm > 0) {
    if (listing.sqm == null || listing.sqm <= 0) return false;
    const pct = options.sqmTolerancePct;
    const min = options.saleSqm * (1 - pct / 100);
    const max = options.saleSqm * (1 + pct / 100);
    if (listing.sqm < min || listing.sqm > max) return false;
  }

  if (options.propertyTypeFilter === "match" && options.salePropertyType) {
    if (listing.property_type !== options.salePropertyType) return false;
  }

  return true;
}
