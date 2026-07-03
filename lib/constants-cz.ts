import type { EnergyClass, RentalMode } from "./types";

/** Typical Brno / Czech Republic assumptions (simplified v1) */
export const CZECH_DEFAULTS = {
  notary_pct: 1,
  agency_pct: 3,
  /** Transfer tax abolished 2020 for standard residential */
  registration_tax_pct: 0,
  /** Flat rental income tax (simplified; progressive option exists) */
  rental_income_tax_pct: 15,
  /** Annual property tax ~0.05% of price (municipal estimate) */
  property_tax_rate: 0.0005,
  maintenance_pct_long: 0.008,
  maintenance_pct_medium: 0.01,
  maintenance_pct_short: 0.012,
  agency_fee_months: 0,
  platform_fee_pct: 0.15,
  cleaning_fee_per_turnover: 0,
  avg_stay_nights: 3.5,
  projection_years: 20,
  projection_years_after_mortgage: 10,
  default_purchase_price: 4_000_000,
  default_sqm: 65,
  default_loan_years: 30,
  default_renovation_cost: 200_000,
  gross_yield_pct: 4.5,
  mortgage_rate_pct: 4,
  investment_down_payment_pct: 20,
  default_rent_rooms: 2,
  listings_fetch_max_pages: 3,
  batch_fetch_max_pages: 5,
  batch_fetch_max_pages_cap: 15,
  batch_fetch_all_pages_hard_cap: 100,
} as const;

export function estimateCzechMonthlyRent(purchasePrice: number): number {
  const raw = (purchasePrice * (CZECH_DEFAULTS.gross_yield_pct / 100)) / 12;
  return Math.round(raw / 500) * 500;
}

export function estimateCzechSemesterMonthlyRent(purchasePrice: number): number {
  return Math.round(estimateCzechMonthlyRent(purchasePrice) * 1.12 / 500) * 500;
}

export function estimateCzechNightlyRate(purchasePrice: number): number {
  const annualLong = estimateCzechMonthlyRent(purchasePrice) * 12;
  const targetAnnual = annualLong * 1.7;
  return Math.round(targetAnnual / (365 * 0.62) / 100) * 100;
}

export function estimateCzechCondominio(purchasePrice: number): number {
  return Math.round(Math.min(4500, Math.max(1500, purchasePrice * 0.0006)));
}

export function estimateCzechPropertyTax(purchasePrice: number, sqm?: number): number {
  if (sqm != null && sqm > 0) {
    return Math.round(Math.max(2000, sqm * 35));
  }
  return Math.round(purchasePrice * CZECH_DEFAULTS.property_tax_rate);
}

export function estimateCzechInsurance(purchasePrice: number): number {
  return Math.round(2500 + purchasePrice * 0.001);
}

export function estimateCzechFurnishing(purchasePrice: number, mode: RentalMode): number {
  if (mode === "long_term") {
    return Math.round(Math.min(120_000, Math.max(40_000, purchasePrice * 0.02)));
  }
  if (mode === "medium_term_semester") {
    return Math.round(Math.min(180_000, Math.max(80_000, purchasePrice * 0.035)));
  }
  return Math.round(Math.min(250_000, Math.max(100_000, purchasePrice * 0.05)));
}

export function estimateCzechUtilitiesAnnual(
  sqm: number,
  energyClass: EnergyClass,
  mode: RentalMode,
  occupancyPct: number,
): number {
  if (mode === "long_term" || mode === "medium_term_semester") return 0;
  const energyRank = ["A4", "A3", "A2", "A1", "B", "C", "D", "E", "F", "G"];
  const idx = energyRank.indexOf(energyClass);
  const basePerSqm = idx <= 4 ? 180 : idx <= 6 ? 220 : 260;
  const factor = 0.6 + (occupancyPct / 100) * 0.5;
  return Math.round(sqm * basePerSqm * 1.35 * factor);
}
