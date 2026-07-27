import type { SaleListingSignals } from "./sale-listing-signals";

export interface FairPpsqmFactor {
  id: string;
  pct: number;
}

export interface FairSalePpsqmEstimate {
  /** Zone (or city) baseline €/m² or Kč/m² before quality adjustments. */
  basePpsqm: number;
  /** Adjusted fair asking €/m² or Kč/m². */
  fairPpsqm: number;
  /** Net adjustment applied to base (e.g. -0.18 = −18%). */
  adjustmentPct: number;
  factors: FairPpsqmFactor[];
}

const MIN_ADJ = -0.4;
const MAX_ADJ = 0.3;

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
 * Fair sale €/m² (or Kč/m²) from zone average, adjusted for ownership, floor,
 * condition, building type, outdoor space, energy, lift/garage.
 * Heuristic screening aid — not an appraisal.
 */
export function estimateFairSalePpsqm(input: {
  zoneAvgPpsqm: number | null | undefined;
  cityAvgPpsqm?: number | null;
  signals: SaleListingSignals;
  energyClass?: string | null;
  lift?: boolean | null;
  garage?: boolean | null;
}): FairSalePpsqmEstimate | null {
  const base =
    input.zoneAvgPpsqm != null && input.zoneAvgPpsqm > 0
      ? input.zoneAvgPpsqm
      : input.cityAvgPpsqm != null && input.cityAvgPpsqm > 0
        ? input.cityAvgPpsqm
        : null;
  if (base == null) return null;

  const factors: FairPpsqmFactor[] = [];
  const { signals } = input;

  if (signals.ownership === "cooperative") factors.push({ id: "cooperative", pct: -0.15 });
  if (signals.coop_loan) factors.push({ id: "coop_loan", pct: -0.08 });

  if (signals.floor === "basement") factors.push({ id: "basement", pct: -0.2 });
  else if (signals.floor === "ground") factors.push({ id: "ground", pct: -0.05 });

  if (signals.condition === "new_build" || signals.new_build) {
    factors.push({ id: "new_build", pct: 0.12 });
  } else if (signals.condition === "renovated" || signals.after_renovation) {
    factors.push({ id: "renovated", pct: 0.07 });
  } else if (signals.condition === "needs_renovation" || signals.needs_renovation) {
    factors.push({ id: "needs_renovation", pct: -0.15 });
  } else if (signals.condition === "old") {
    factors.push({ id: "old", pct: -0.1 });
  }

  if (signals.panel_building) factors.push({ id: "panel", pct: -0.07 });
  if (signals.brick_building) factors.push({ id: "brick", pct: 0.04 });
  if (signals.has_outdoor) factors.push({ id: "outdoor", pct: 0.03 });

  const energy = energyAdjustment(input.energyClass);
  if (energy) factors.push(energy);

  if (input.lift === true && signals.floor === "upper") {
    factors.push({ id: "lift", pct: 0.03 });
  } else if (input.lift === false && signals.floor === "upper") {
    factors.push({ id: "no_lift", pct: -0.05 });
  }

  if (input.garage === true) factors.push({ id: "garage", pct: 0.04 });

  const raw = factors.reduce((sum, f) => sum + f.pct, 0);
  const adjustmentPct = Math.min(MAX_ADJ, Math.max(MIN_ADJ, raw));
  const fairPpsqm = Math.round(base * (1 + adjustmentPct));

  return { basePpsqm: Math.round(base), fairPpsqm, adjustmentPct, factors };
}

/** Asking vs fair: negative = cheaper than fair (potential deal). */
export function askingVsFairPct(askingPpsqm: number | null, fairPpsqm: number | null): number | null {
  if (askingPpsqm == null || fairPpsqm == null || fairPpsqm <= 0) return null;
  return ((askingPpsqm - fairPpsqm) / fairPpsqm) * 100;
}
