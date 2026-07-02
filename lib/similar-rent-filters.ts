import type { MapListing } from "./types";

export const SIMILAR_RENT_RADIUS_PRESETS = [
  { id: "tight", label: "1,5 km", radiusM: 1_500 },
  { id: "default", label: "2,5 km", radiusM: 2_500 },
  { id: "wide", label: "5 km", radiusM: 5_000 },
  { id: "wider", label: "10 km", radiusM: 10_000 },
  { id: "zone", label: "Solo zona (testo)", radiusM: null },
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
  limit: number;
}

export const DEFAULT_SIMILAR_RENT_FILTERS: SimilarRentFilterState = {
  radiusPresetId: "default",
  roomsFilter: "similar",
  sqmFilter: "any",
  propertyTypeFilter: "any",
  limit: 12,
};

export const SIMILAR_RENT_LIMIT_OPTIONS = [12, 24, 36] as const;

export interface SimilarRentSearchOptions {
  radiusM: number | null;
  limit: number;
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
  return preset?.radiusM ?? 2_500;
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
