import type { EnergyClass, RentalMode } from "./types";

/** Parametri fissi — stime tipiche Italia */
export const ITALY_DEFAULTS = {
  notary_pct: 1.5,
  /** Minimo onorario notaio (rogito senza mutuo) */
  notary_fee_min_eur: 1000,
  /** Minimo con mutuo (atto + ipoteca ≈ doppio) */
  notary_fee_min_with_mortgage_eur: 2000,
  registration_tax_pct_prima_casa: 2,
  registration_tax_pct_investment: 9,
  agency_pct: 3,
  /** Aliquota IMU ordinaria Reggio Calabria (seconda casa / investimento) */
  imu_rate: 0.0106,
  maintenance_pct_long: 0.008,
  maintenance_pct_medium: 0.01,
  maintenance_pct_short: 0.012,
  agency_fee_months: 0,
  /** Property manager fee as % of monthly rent */
  property_manager_fee_pct: 10,
  platform_fee_pct: 0.15,
  cleaning_fee_per_turnover: 30,
  avg_stay_nights: 3.5,
  projection_years: 20,
  /** Anni simulati dopo estinzione mutuo */
  projection_years_after_mortgage: 10,
  cedolare_long: 0.21,
  cedolare_short: 0.26,
  cedolare_short_first_property: 0.21,
  cadastral_ratio: 0.55,
  /** Prezzo di acquisto predefinito nel form */
  default_purchase_price: 100_000,
  /** Superficie predefinita nel form (m²) */
  default_sqm: 80,
  /** Durata mutuo predefinita (anni) */
  default_loan_years: 30,
  /** Ristrutturazione predefinita nel form (€) */
  default_renovation_cost: 5_000,
  /** Rendimento lordo annuo tipico (provincia / piccolo capoluogo) */
  gross_yield_pct: 5.5,
  /** Tasso mutuo indicativo 2025–2026 */
  mortgage_rate_pct: 4.0,
  /** Anticipo minimo tipico per investimento */
  investment_down_payment_pct: 20,
  /** Locali predefiniti per calcolo affitto per stanza */
  default_rent_rooms: 2,
  /** Pagine per richiesta singola (Carica): 0 = tutte fino al cap */
  listings_fetch_max_pages: 0,
  /** Pagine Idealista per importazione batch (default) */
  batch_fetch_max_pages: 5,
  /** Massimo pagine consentite in batch */
  batch_fetch_max_pages_cap: 10,
  /** Hard cap when fetching all pages */
  batch_fetch_all_pages_hard_cap: 100,
} as const;

/** Canone mensile da rendimento lordo ~5–6% */
export function estimateMonthlyRent(purchasePrice: number): number {
  const raw = (purchasePrice * (ITALY_DEFAULTS.gross_yield_pct / 100)) / 12;
  return Math.round(raw / 25) * 25;
}

/** Canone transitorio/semestrale: ~15% sopra il lungo termine (arredato, studenti/lavoratori) */
export function estimateSemesterMonthlyRent(purchasePrice: number): number {
  return Math.round(estimateMonthlyRent(purchasePrice) * 1.15 / 25) * 25;
}

/** Tariffa notturna: ~1.8× ricavo annuo lungo termine, occupazione ~65% */
export function estimateNightlyRate(purchasePrice: number): number {
  const annualLong = estimateMonthlyRent(purchasePrice) * 12;
  const targetAnnual = annualLong * 1.8;
  return Math.round(targetAnnual / (365 * 0.65));
}

export function estimateCondominio(purchasePrice: number): number {
  return Math.round(Math.min(130, Math.max(45, purchasePrice * 0.00075)));
}

export function applyNotaryFeeFloor(feeEuro: number, hasMortgage: boolean): number {
  const floor = hasMortgage
    ? ITALY_DEFAULTS.notary_fee_min_with_mortgage_eur
    : ITALY_DEFAULTS.notary_fee_min_eur;
  return Math.round(Math.max(floor, feeEuro));
}

export function estimateTari(purchasePrice: number): number {
  return Math.round(150 + purchasePrice * 0.0012);
}

export function estimateInsurance(purchasePrice: number): number {
  return Math.round(180 + purchasePrice * 0.001);
}

export function estimateFurnishing(purchasePrice: number, mode: RentalMode): number {
  if (mode === "long_term") {
    return Math.round(Math.min(4000, Math.max(1000, purchasePrice * 0.02)));
  }
  if (mode === "medium_term_semester") {
    return Math.round(Math.min(6000, Math.max(2500, purchasePrice * 0.035)));
  }
  return Math.round(Math.min(8000, Math.max(3000, purchasePrice * 0.05)));
}

/** €/m² — ristrutturazione completa tipica (media Italia) */
export const RENOVATION_EUR_PER_SQM = {
  min: 500,
  mid: 700,
  max: 900,
} as const;

export interface RenovationCostEstimate {
  sqm: number;
  min: number;
  max: number;
  mid: number;
}

function renovationSqm(sqm: number | null | undefined, purchasePrice?: number | null): number {
  if (sqm != null && sqm > 0) return sqm;
  if (purchasePrice != null && purchasePrice > 0) return estimateSqmFromPrice(purchasePrice);
  return ITALY_DEFAULTS.default_sqm;
}

function roundRenovationCost(n: number): number {
  return Math.round(n / 500) * 500;
}

/** Stima costo ristrutturazione da superficie (range + punto medio). */
export function estimateRenovationCostRange(
  sqm: number | null | undefined,
  purchasePrice?: number | null,
): RenovationCostEstimate {
  const area = renovationSqm(sqm, purchasePrice);
  return {
    sqm: area,
    min: roundRenovationCost(area * RENOVATION_EUR_PER_SQM.min),
    max: roundRenovationCost(area * RENOVATION_EUR_PER_SQM.max),
    mid: roundRenovationCost(area * RENOVATION_EUR_PER_SQM.mid),
  };
}

/** Stima costo ristrutturazione da superficie (punto medio, arrotondato a €500). */
export function estimateRenovationCost(
  sqm: number | null | undefined,
  purchasePrice?: number | null,
): number {
  return estimateRenovationCostRange(sqm, purchasePrice).mid;
}

/** Costo ristrutturazione per import da annuncio; null se non da ristrutturare. */
export function listingRenovationCost(
  needsRenovation: boolean | null | undefined,
  sqm: number | null | undefined,
  purchasePrice?: number | null,
): number | null {
  if (needsRenovation !== true) return null;
  return estimateRenovationCost(sqm, purchasePrice);
}

/** Range ristrutturazione per annuncio; null se non da ristrutturare. */
export function listingRenovationCostRange(
  needsRenovation: boolean | null | undefined,
  sqm: number | null | undefined,
  purchasePrice?: number | null,
): RenovationCostEstimate | null {
  if (needsRenovation !== true) return null;
  return estimateRenovationCostRange(sqm, purchasePrice);
}

export function estimateRenovationMinor(purchasePrice: number): number {
  return Math.round(Math.min(15000, Math.max(3000, purchasePrice * 0.05)));
}

export const RENOVATION_PRESETS = {
  none: 0,
  minor: 5_000,
  full: 35_000,
  reconstruction: 80_000,
} as const;

export const ENERGY_CLASS_OPTIONS: { value: EnergyClass; label: string }[] = [
  { value: "A4", label: "A4 — nuova costruzione" },
  { value: "A3", label: "A3" },
  { value: "A2", label: "A2" },
  { value: "A1", label: "A1" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "E", label: "E" },
  { value: "F", label: "F" },
  { value: "G", label: "G — alto consumo" },
];

/** Moltiplicatore spesa energetica vs classe C (APE) */
export const ENERGY_CLASS_MULTIPLIER: Record<EnergyClass, number> = {
  A4: 0.35,
  A3: 0.42,
  A2: 0.48,
  A1: 0.55,
  B: 0.72,
  C: 1.0,
  D: 1.28,
  E: 1.62,
  F: 2.05,
  G: 2.55,
};

/** €/m² anno (classe C) — luce, gas, acqua per affitto breve (ospiti). */
const UTILITIES_BASE_PER_SQM_SHORT = 18;

/** Canone fisso annuo: wi‑fi, quote fisse luce/gas, canoni minimi. */
const UTILITIES_FIXED_SHORT_EUR = 550;

/** Minimo realistico piccolo monolocale/bilocale in breve termine. */
const UTILITIES_FLOOR_SHORT_EUR = 1200;

/** Stima mq da prezzo (~€2.200/m² media provinciale) */
export function estimateSqmFromPrice(purchasePrice: number): number {
  return Math.max(25, Math.round(purchasePrice / 2200));
}

/** Bollette annue a carico proprietario (0 in lungo termine: paga l'inquilino) */
export function estimateUtilitiesAnnual(
  sqm: number,
  energyClass: EnergyClass,
  rentalMode: RentalMode,
  occupancyPct = 65,
): number {
  if (rentalMode === "long_term" || rentalMode === "medium_term_semester") return 0;
  const mult = ENERGY_CLASS_MULTIPLIER[energyClass];
  const occ = Math.min(100, Math.max(0, occupancyPct));
  const occFactor = 0.5 + 0.5 * (occ / 100);
  const variable = Math.max(25, sqm) * UTILITIES_BASE_PER_SQM_SHORT * mult * occFactor;
  const raw = Math.round(variable + UTILITIES_FIXED_SHORT_EUR);
  return Math.max(UTILITIES_FLOOR_SHORT_EUR, raw);
}
