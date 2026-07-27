import type { TrackedRentalListing } from "@/lib/types";
import type { SaleListingSignals } from "./sale-listing-signals";

export interface FairPpsqmFactor {
  id: string;
  pct: number;
}

export interface FairSalePpsqmEstimate {
  /** Median €/m² (or Kč/m²) of active size-matched comps. */
  basePpsqm: number;
  /** Adjusted fair asking €/m² or Kč/m². */
  fairPpsqm: number;
  /** Net adjustment applied to base (e.g. -0.18 = −18%). */
  adjustmentPct: number;
  compCount: number;
  factors: FairPpsqmFactor[];
}

const MIN_ADJ = -0.35;
const MAX_ADJ = 0.25;
const MIN_COMPS = 3;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function sizeBand(sqm: number): "xs" | "s" | "m" | "l" | "xl" {
  if (sqm <= 40) return "xs";
  if (sqm <= 60) return "s";
  if (sqm <= 90) return "m";
  if (sqm <= 130) return "l";
  return "xl";
}

function listingPpsqm(listing: TrackedRentalListing): number | null {
  if (listing.sqm == null || listing.sqm <= 0 || !(listing.price > 0)) return null;
  return listing.price / listing.sqm;
}

/**
 * Active comps: prefer same zone + similar size, then widen.
 * Avoids mixing 40 m² flats with 200 m² houses in the same zone average.
 */
export function comparableSalePpsqmValues(
  listing: TrackedRentalListing,
  universe: TrackedRentalListing[],
): number[] {
  const subjectSqm = listing.sqm;
  if (subjectSqm == null || subjectSqm <= 0) return [];

  const active = universe.filter((item) => {
    if (item.id === listing.id) return false;
    if (item.status !== "active") return false;
    return listingPpsqm(item) != null;
  });

  const sameZone = listing.zone
    ? active.filter((item) => item.zone === listing.zone)
    : [];
  const pool = sameZone.length >= MIN_COMPS ? sameZone : active;

  const tight = pool.filter((item) => {
    const sqm = item.sqm!;
    const ratio = sqm / subjectSqm;
    return ratio >= 0.65 && ratio <= 1.45;
  });
  if (tight.length >= MIN_COMPS) {
    return tight.map((item) => listingPpsqm(item)!);
  }

  const band = sizeBand(subjectSqm);
  const byBand = pool.filter((item) => sizeBand(item.sqm!) === band);
  if (byBand.length >= MIN_COMPS) {
    return byBand.map((item) => listingPpsqm(item)!);
  }

  return pool.map((item) => listingPpsqm(item)!);
}

function energyAdjustment(energyClass: string | null | undefined): FairPpsqmFactor | null {
  if (!energyClass?.trim()) return null;
  const cls = energyClass.trim().toUpperCase();
  if (cls.startsWith("A")) return { id: "energy_a", pct: 0.04 };
  if (cls === "B") return { id: "energy_b", pct: 0.02 };
  if (cls === "C") return { id: "energy_c", pct: 0 };
  if (cls === "D") return { id: "energy_d", pct: -0.03 };
  if (cls === "E" || cls === "F" || cls === "G") return { id: "energy_low", pct: -0.06 };
  return null;
}

/**
 * Fair sale €/m² from median of active size-matched comps, then quality adjustments.
 * Heuristic screening aid — not an appraisal.
 */
export function estimateFairSalePpsqm(input: {
  listing: TrackedRentalListing;
  universe: TrackedRentalListing[];
  signals: SaleListingSignals;
  energyClass?: string | null;
}): FairSalePpsqmEstimate | null {
  const comps = comparableSalePpsqmValues(input.listing, input.universe);
  const base = median(comps);
  if (base == null || base <= 0) return null;

  const factors: FairPpsqmFactor[] = [];
  const { signals } = input;

  if (signals.ownership === "cooperative") factors.push({ id: "cooperative", pct: -0.12 });
  if (signals.coop_loan) factors.push({ id: "coop_loan", pct: -0.06 });

  if (signals.floor === "basement") factors.push({ id: "basement", pct: -0.15 });
  else if (signals.floor === "ground") factors.push({ id: "ground", pct: -0.04 });

  if (signals.condition === "new_build" || signals.new_build) {
    factors.push({ id: "new_build", pct: 0.1 });
  } else if (signals.condition === "renovated" || signals.after_renovation) {
    factors.push({ id: "renovated", pct: 0.05 });
  } else if (signals.condition === "needs_renovation" || signals.needs_renovation) {
    factors.push({ id: "needs_renovation", pct: -0.12 });
  } else if (signals.condition === "old") {
    factors.push({ id: "old", pct: -0.08 });
  }

  if (signals.panel_building) factors.push({ id: "panel", pct: -0.05 });
  if (signals.brick_building) factors.push({ id: "brick", pct: 0.03 });
  if (signals.has_outdoor) factors.push({ id: "outdoor", pct: 0.02 });

  const energy = energyAdjustment(input.energyClass);
  if (energy) factors.push(energy);

  if (input.listing.lift === true && signals.floor === "upper") {
    factors.push({ id: "lift", pct: 0.02 });
  } else if (input.listing.lift === false && signals.floor === "upper") {
    factors.push({ id: "no_lift", pct: -0.04 });
  }

  if (input.listing.garage === true) factors.push({ id: "garage", pct: 0.03 });

  const raw = factors.reduce((sum, f) => sum + f.pct, 0);
  const adjustmentPct = Math.min(MAX_ADJ, Math.max(MIN_ADJ, raw));
  const fairPpsqm = Math.round(base * (1 + adjustmentPct));

  return {
    basePpsqm: Math.round(base),
    fairPpsqm,
    adjustmentPct,
    compCount: comps.length,
    factors,
  };
}

/** Asking vs fair: negative = cheaper than fair (potential deal). */
export function askingVsFairPct(askingPpsqm: number | null, fairPpsqm: number | null): number | null {
  if (askingPpsqm == null || fairPpsqm == null || fairPpsqm <= 0) return null;
  return ((askingPpsqm - fairPpsqm) / fairPpsqm) * 100;
}
