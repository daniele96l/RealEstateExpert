import type { InvestmentScenario } from "../types";
import { effectiveMaintenancePct, effectiveOccupancyRate } from "./helpers";
import { computeImuAnnual } from "./taxes";

export function monthlyGrossRent(scenario: InvestmentScenario): number {
  const occupancy = effectiveOccupancyRate(scenario);
  if (scenario.rental.rental_mode !== "short_term_airbnb") {
    return (scenario.rental.monthly_rent ?? 0) * occupancy;
  }
  return (scenario.rental.nightly_rate ?? 0) * 30 * occupancy;
}

export function monthlyPlatformFee(grossRent: number, scenario: InvestmentScenario): number {
  if (scenario.rental.rental_mode !== "short_term_airbnb") return 0;
  return grossRent * scenario.operating.platform_fee_pct;
}

export function monthlyCleaningFee(scenario: InvestmentScenario): number {
  if (scenario.rental.rental_mode !== "short_term_airbnb") return 0;
  const occupancy = effectiveOccupancyRate(scenario);
  const turnovers = (30 * occupancy) / scenario.rental.avg_stay_nights;
  return turnovers * scenario.operating.cleaning_fee_per_turnover;
}

/** Net short-term income after platform, cleaning, agency/PM, and rental tax. */
export function shortTermNetMonthly(params: {
  nightlyRate: number;
  /** Occupancy as percent 0–100, or fraction 0–1. */
  occupancyPct: number;
  /** Platform fee as percent 0–100, or fraction 0–1. */
  platformFeePct: number;
  avgStayNights: number;
  cleaningPerTurnover: number;
  /** Property-manager / agency fee as percent 0–100, or fraction 0–1 (on gross). */
  agencyFeePct?: number;
  /** Rental income tax (cedolare / flat tax) as percent 0–100, or fraction 0–1 (on gross). */
  taxPct?: number;
}): {
  gross: number;
  platform: number;
  cleaning: number;
  agency: number;
  tax: number;
  net: number;
} {
  const nightly = Math.max(0, params.nightlyRate);
  const occRaw = Math.max(0, params.occupancyPct);
  const occupancy = occRaw > 1 ? occRaw / 100 : occRaw;
  const toFrac = (raw: number) => {
    const v = Math.max(0, raw);
    return v > 1 ? v / 100 : v;
  };
  const platformPct = toFrac(params.platformFeePct);
  const agencyPct = toFrac(params.agencyFeePct ?? 0);
  const taxPct = toFrac(params.taxPct ?? 0);
  const avgStay = Math.max(0.5, params.avgStayNights);
  const cleaningFee = Math.max(0, params.cleaningPerTurnover);

  const gross = nightly * 30 * occupancy;
  const platform = gross * platformPct;
  const turnovers = (30 * occupancy) / avgStay;
  const cleaning = turnovers * cleaningFee;
  const agency = gross * agencyPct;
  const tax = gross * taxPct;
  const net = Math.max(0, gross - platform - cleaning - agency - tax);
  return { gross, platform, cleaning, agency, tax, net };
}

/** Commissione gestione immobile: % del canone mensile pieno */
export function monthlyAgencyFee(scenario: InvestmentScenario): number {
  if (scenario.rental.rental_mode === "short_term_airbnb") return 0;
  const fullRent = scenario.rental.monthly_rent ?? 0;
  const pct = scenario.operating.property_manager_fee_pct;
  if (pct > 0) return fullRent * (pct / 100);
  return (fullRent * scenario.operating.agency_fee_months) / 12;
}

export function monthlyTurnoverFee(scenario: InvestmentScenario): number {
  const perYear =
    scenario.rental.turnovers_per_year * scenario.operating.cleaning_fee_per_turnover;
  return perYear / 12;
}

export function monthlyFixedOpex(scenario: InvestmentScenario) {
  return {
    imu: computeImuAnnual(scenario) / 12,
    tari: scenario.operating.tari_annual / 12,
    condominio: scenario.operating.condominio_monthly,
    insurance: scenario.operating.insurance_annual / 12,
    maintenance:
      (scenario.property.purchase_price * effectiveMaintenancePct(scenario)) / 12,
    utilities: scenario.operating.utilities_landlord_annual / 12,
  };
}
