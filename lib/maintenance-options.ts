import type { MarketId } from "./markets";
import type { RentalMode } from "./types";
import { ITALY_DEFAULTS } from "./constants";
import { CZECH_DEFAULTS } from "./constants-cz";

export const MAINTENANCE_PCT_OPTIONS = [
  { id: "low", pct: 0.005 },
  { id: "standard", pct: 0.008 },
  { id: "medium", pct: 0.01 },
  { id: "high", pct: 0.012 },
  { id: "very_high", pct: 0.015 },
  { id: "heavy", pct: 0.02 },
] as const;

export type MaintenanceOptionId = (typeof MAINTENANCE_PCT_OPTIONS)[number]["id"];

export function maintenancePctForRentalMode(mode: RentalMode, market: MarketId = "it"): number {
  const d = market === "cz" ? CZECH_DEFAULTS : ITALY_DEFAULTS;
  if (mode === "short_term_airbnb") return d.maintenance_pct_short;
  if (mode === "medium_term_semester") return d.maintenance_pct_medium;
  return d.maintenance_pct_long;
}

export function sanitizeMaintenancePct(
  pct: number,
  mode: RentalMode,
  market: MarketId = "it",
): number {
  const known = MAINTENANCE_PCT_OPTIONS.some((o) => o.pct === pct);
  if (Number.isFinite(pct) && pct >= 0 && pct <= 0.05 && known) return pct;
  if (Number.isFinite(pct) && pct >= 0 && pct <= 0.05) {
    const nearest = MAINTENANCE_PCT_OPTIONS.reduce((best, o) =>
      Math.abs(o.pct - pct) < Math.abs(best.pct - pct) ? o : best,
    );
    return nearest.pct;
  }
  return maintenancePctForRentalMode(mode, market);
}

export function monthlyMaintenanceCost(purchasePrice: number, maintenancePct: number): number {
  return (Math.max(0, purchasePrice) * maintenancePct) / 12;
}
