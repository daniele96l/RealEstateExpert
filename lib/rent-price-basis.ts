import type { MapListing } from "./types";

export type RentPriceBasis = "whole" | "room" | "unknown";

const WHOLE_FLAT_TYPES = new Set(["flat", "studio", "duplex", "penthouse", "chalet", "countryhouse", "homes"]);
const ROOM_TITLE_RE = /\b(stanza|camera|posto letto|room in|single room|bedroom in|shared flat)\b/i;

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
