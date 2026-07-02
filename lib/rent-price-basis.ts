import type { MapListing } from "./types";

export type RentPriceBasis = "whole" | "room" | "unknown";

const WHOLE_FLAT_TYPES = new Set(["flat", "studio", "duplex", "penthouse", "chalet", "countryhouse", "homes"]);
const ROOM_TITLE_RE = /\b(stanza|camera|posto letto|room in|single room|bedroom in|shared flat)\b/i;

/** Premium for ≤2 locali — whole unit, exclusive use. */
export const SINGLE_RENTABLE_ROOM_PREMIUM = 1.5;

export function hasUnderTwoLocali(rooms: number | null | undefined): boolean {
  return rooms != null && rooms <= 2;
}

const LOW_RENT_PER_SQM_MONTHLY = 6;

export function inferRentPriceBasis(listing: MapListing): RentPriceBasis {
  const type = listing.property_type?.toLowerCase() ?? "";
  const title = listing.title.toLowerCase();

  if (type === "room" || ROOM_TITLE_RE.test(title)) {
    return "room";
  }

  if (WHOLE_FLAT_TYPES.has(type)) {
    return "whole";
  }

  if (listing.sqm != null && listing.sqm > 0) {
    const perSqm = listing.price / listing.sqm;
    if (perSqm < LOW_RENT_PER_SQM_MONTHLY) return "room";
    if (perSqm >= LOW_RENT_PER_SQM_MONTHLY) return "whole";
  }

  return "unknown";
}

export function rentPriceBasisLabel(basis: RentPriceBasis): string {
  if (basis === "room") return "stanza";
  if (basis === "whole") return "intero";
  return "da verificare";
}

export function rentPriceBasisBadgeClass(basis: RentPriceBasis): string {
  if (basis === "room") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  if (basis === "whole") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  return "border-slate-500/40 bg-slate-500/10 text-slate-400";
}

/** Stanze affittabili stimate da «locali» Idealista (soggiorno + camere; cucina/bagno esclusi). */
export function estimateRentableRooms(rooms: number | null | undefined): number | null {
  if (rooms == null || rooms < 1) return null;
  if (rooms === 1) return 1;
  return Math.max(1, rooms - 1);
}

export function rentableRoomsAssumption(rooms: number | null | undefined): string | null {
  const rentable = estimateRentableRooms(rooms);
  if (rentable == null || rooms == null) return null;
  if (rooms === 1) {
    return "Monolocale: si considera 1 unità affittabile (intero appartamento).";
  }
  return `Su Idealista «${rooms} locali» di solito include soggiorno + camere (cucina e bagno esclusi). Si presume 1 locale = soggiorno → ${rentable} stanze affittabili.`;
}

export interface WholeFlatRentEstimate {
  pricePerRoom: number;
  roomCount: number;
  totalMonthly: number;
}

/** Stima affitto intero = prezzo stanza × n. locali (es. 2 × 400 € = 800 €). */
export function estimateWholeFlatRent(
  listing: MapListing,
  basis: RentPriceBasis,
): WholeFlatRentEstimate | null {
  if (basis !== "room") return null;
  const roomCount = listing.rooms;
  if (roomCount == null || roomCount < 1) return null;
  return {
    pricePerRoom: listing.price,
    roomCount,
    totalMonthly: listing.price * roomCount,
  };
}

export function effectiveMonthlyRent(listing: MapListing): number {
  const basis = inferRentPriceBasis(listing);
  return estimateWholeFlatRent(listing, basis)?.totalMonthly ?? listing.price;
}

export function listingWithEffectiveRent(listing: MapListing): MapListing {
  const total = effectiveMonthlyRent(listing);
  if (total === listing.price) return listing;
  return { ...listing, price: total };
}

/** Monthly rent attributed to a single room (stanza price, or whole-flat price ÷ locali). */
export function monthlyRentPerRoom(listing: MapListing): number | null {
  const basis = inferRentPriceBasis(listing);
  const wholeFlat = estimateWholeFlatRent(listing, basis);
  if (wholeFlat) return wholeFlat.pricePerRoom;
  if (listing.rooms != null && listing.rooms > 0) {
    return Math.round(listing.price / listing.rooms);
  }
  return null;
}

export function averageMonthlyRentPerRoom(listings: MapListing[]): number | null {
  const values = listings.map(monthlyRentPerRoom).filter((v): v is number => v != null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export type SimilarWholeRentMode = "under_two_locali" | "multi_room";
export type SimilarRentEstimateMethod = "per_room" | "per_sqm";

export function monthlyRentPerSqm(listing: MapListing): number | null {
  const rent = effectiveMonthlyRent(listing);
  if (listing.sqm == null || listing.sqm <= 0) return null;
  return rent / listing.sqm;
}

export function averageMonthlyRentPerSqm(listings: MapListing[]): number | null {
  const values = listings.map(monthlyRentPerSqm).filter((v): v is number => v != null);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function estimateWholeMonthlyFromSqmBenchmark(
  sale: Pick<MapListing, "sqm">,
  avgRentPerSqm: number,
): number | null {
  if (sale.sqm == null || sale.sqm <= 0) return null;
  return Math.round(avgRentPerSqm * sale.sqm);
}

export function estimateWholeMonthlyFromSimilarBenchmark(
  sale: Pick<MapListing, "rooms">,
  avgRentPerRoom: number,
): { wholeMonthly: number; mode: SimilarWholeRentMode } {
  if (hasUnderTwoLocali(sale.rooms)) {
    return {
      wholeMonthly: Math.round(avgRentPerRoom * SINGLE_RENTABLE_ROOM_PREMIUM),
      mode: "under_two_locali",
    };
  }
  const rentableRooms = estimateRentableRooms(sale.rooms);
  if (rentableRooms != null && rentableRooms > 0) {
    return {
      wholeMonthly: Math.round(avgRentPerRoom * rentableRooms),
      mode: "multi_room",
    };
  }
  return {
    wholeMonthly: Math.round(avgRentPerRoom),
    mode: "multi_room",
  };
}

export function similarRentEstimateSummary(
  sale: Pick<MapListing, "rooms" | "sqm">,
  similarRentals: MapListing[],
  method: SimilarRentEstimateMethod = "per_room",
): {
  method: SimilarRentEstimateMethod;
  avgRentPerRoom: number | null;
  avgRentPerSqm: number | null;
  avgWholeMonthly: number | null;
  wholeEstimateMode: SimilarWholeRentMode | null;
  underTwoLocali: boolean;
} {
  const avgRentPerRoom = averageMonthlyRentPerRoom(similarRentals);
  const avgRentPerSqm = averageMonthlyRentPerSqm(similarRentals);
  const underTwoLocali = hasUnderTwoLocali(sale.rooms);

  if (method === "per_sqm") {
    return {
      method,
      avgRentPerRoom,
      avgRentPerSqm,
      avgWholeMonthly:
        avgRentPerSqm != null ? estimateWholeMonthlyFromSqmBenchmark(sale, avgRentPerSqm) : null,
      wholeEstimateMode: null,
      underTwoLocali,
    };
  }

  if (avgRentPerRoom == null) {
    return {
      method,
      avgRentPerRoom: null,
      avgRentPerSqm,
      avgWholeMonthly: null,
      wholeEstimateMode: null,
      underTwoLocali,
    };
  }
  const { wholeMonthly, mode } = estimateWholeMonthlyFromSimilarBenchmark(sale, avgRentPerRoom);
  return {
    method,
    avgRentPerRoom,
    avgRentPerSqm,
    avgWholeMonthly: wholeMonthly,
    wholeEstimateMode: mode,
    underTwoLocali,
  };
}

export function underTwoLocaliRentNote(): string {
  return `Fino a 2 locali: si usa la media €/stanza in zona +${Math.round((SINGLE_RENTABLE_ROOM_PREMIUM - 1) * 100)}% per uso esclusivo dell'intero immobile.`;
}
