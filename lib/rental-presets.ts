import type { RentalMode } from "./types";
import {
  ITALY_DEFAULTS,
  estimateFurnishing,
  estimateMonthlyRent,
  estimateNightlyRate,
  estimateSemesterMonthlyRent,
  estimateTari,
} from "./constants";

/** Regole fiscali e operative — fonti: Agenzia delle Entrate, DL 50/2017, L. 199/2025 */
export const RENTAL_MODE_RULES = {
  long_term: {
    label: "Affitto lungo termine",
    cedolare_pct: 21,
    cedolare_note:
      "Cedolare secca 21% sul canone (contratto 4+4 a canone libero). Canone concordato: 10% in comuni ad alta tensione.",
    imu_note: "IMU intera sulla seconda casa — a carico del proprietario, nessuna esenzione per il solo fatto di affittare.",
    occupancy_pct: 92,
    occupancy_note: "~1 mese di vacanza/anno tra un inquilino e l'altro.",
    agency_fee_months: 1,
    platform_fee_pct: 0,
    cleaning_fee_per_turnover: 0,
    utilities_landlord_annual: 0,
    utilities_note: "Utenze normalmente a carico dell'inquilino.",
    maintenance_pct: ITALY_DEFAULTS.maintenance_pct_long,
    tari_multiplier: 1,
    insurance_multiplier: 1,
    imu_surcharge: false,
    imu_surcharge_rate: 0,
    avg_stay_nights: 0,
    turnovers_per_year: 0,
  },
  medium_term_semester: {
    label: "Affitto medio termine / semestri",
    cedolare_pct: 21,
    cedolare_note:
      "Cedolare secca 21% (contratto transitorio 1–18 mesi o locazione a semestri). Serve documentazione del motivo transitorio.",
    imu_note: "IMU intera sulla seconda casa — a carico del proprietario.",
    occupancy_pct: 82,
    occupancy_note:
      "~2 mesi vuoti/anno tra un semestre e l'altro (estate studenti, cambio inquilino).",
    agency_fee_months: 1.5,
    platform_fee_pct: 0,
    cleaning_fee_per_turnover: 120,
    utilities_landlord_annual: 0,
    utilities_note: "Utenze di solito a carico dell'inquilino; spesso canone leggermente maggiorato se arredato.",
    maintenance_pct: ITALY_DEFAULTS.maintenance_pct_medium,
    tari_multiplier: 1,
    insurance_multiplier: 1.1,
    imu_surcharge: false,
    imu_surcharge_rate: 0,
    avg_stay_nights: 0,
    turnovers_per_year: 2,
  },
  short_term_airbnb: {
    label: "Affitto breve / Airbnb",
    cedolare_pct: 21,
    cedolare_note:
      "Cedolare secca 21% se questo è l'unico immobile in locazione breve; 26% dal secondo immobile (Agenzia delle Entrate). Contratti ≤ 30 giorni.",
    imu_note:
      "IMU dovuta come seconda casa — nessuna esenzione. Alcuni comuni applicano aliquote maggiorate per uso turistico.",
    occupancy_pct: 65,
    occupancy_note:
      "~240 notti/anno (65%). Città turistiche 70–75%; limite comunale spesso 120 giorni/anno in centro storico.",
    agency_fee_months: 0,
    platform_fee_pct: 0.15,
    cleaning_fee_per_turnover: 55,
    utilities_landlord_annual: 900,
    utilities_note: "Wi‑fi, elettricità e gas spesso a carico del proprietario.",
    maintenance_pct: ITALY_DEFAULTS.maintenance_pct_short,
    tari_multiplier: 1.35,
    insurance_multiplier: 1.6,
    imu_surcharge: false,
    imu_surcharge_rate: 0.002,
    avg_stay_nights: ITALY_DEFAULTS.avg_stay_nights,
    turnovers_per_year: 0,
  },
} as const;

export interface RentalModePresetValues {
  occupancy_pct: number;
  monthly_rent: number;
  nightly_rate: number;
  furnishing_cost: number;
  condominio_monthly: number;
  cedolare_rate: number;
  /** Per InvestmentScenario.operating / tax */
  operating: {
    agency_fee_months: number;
    platform_fee_pct: number;
    cleaning_fee_per_turnover: number;
    utilities_landlord_annual: number;
    maintenance_pct: number;
    tari_annual: number;
    insurance_annual: number;
    affitti_brevi_imu_surcharge: boolean;
    affitti_brevi_imu_surcharge_rate: number;
  };
  rental: {
    avg_stay_nights: number;
    turnovers_per_year: number;
  };
}

export function getRentalModePreset(
  mode: RentalMode,
  purchasePrice: number,
): RentalModePresetValues {
  const rules = RENTAL_MODE_RULES[mode];

  return {
    occupancy_pct: rules.occupancy_pct,
    monthly_rent:
      mode === "medium_term_semester"
        ? estimateSemesterMonthlyRent(purchasePrice)
        : estimateMonthlyRent(purchasePrice),
    nightly_rate: estimateNightlyRate(purchasePrice),
    furnishing_cost: estimateFurnishing(purchasePrice, mode),
    condominio_monthly: 0,
    cedolare_rate: rules.cedolare_pct / 100,
    operating: {
      agency_fee_months: rules.agency_fee_months,
      platform_fee_pct: rules.platform_fee_pct,
      cleaning_fee_per_turnover: rules.cleaning_fee_per_turnover,
      utilities_landlord_annual: rules.utilities_landlord_annual,
      maintenance_pct: rules.maintenance_pct,
      tari_annual: Math.round(estimateTari(purchasePrice) * rules.tari_multiplier),
      insurance_annual: 0,
      affitti_brevi_imu_surcharge: rules.imu_surcharge,
      affitti_brevi_imu_surcharge_rate: rules.imu_surcharge_rate,
    },
    rental: {
      avg_stay_nights: rules.avg_stay_nights || ITALY_DEFAULTS.avg_stay_nights,
      turnovers_per_year: rules.turnovers_per_year,
    },
  };
}

export function getRentalModeRules(mode: RentalMode) {
  return RENTAL_MODE_RULES[mode];
}
