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
  /** Landlord utilities (bollette) monthly — typically paid by host on short-term. */
  utilitiesMonthly?: number;
}): {
  gross: number;
  platform: number;
  cleaning: number;
  agency: number;
  tax: number;
  utilities: number;
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
  const utilities = Math.max(0, params.utilitiesMonthly ?? 0);
  const net = Math.max(0, gross - platform - cleaning - agency - tax - utilities);
  return { gross, platform, cleaning, agency, tax, utilities, net };
}

export type ShortTermSeasonId = "low" | "mid" | "high";

export type ShortTermSeasonInputs = {
  nightlyRate: number;
  occupancyPct: number;
  /** Months of the year in this season (weights; normalized if sum ≠ 12). */
  months: number;
};

export type ShortTermSeasonalNet = ReturnType<typeof shortTermNetMonthly> & {
  bySeason: Record<ShortTermSeasonId, ReturnType<typeof shortTermNetMonthly>>;
  /** Effective occupancy % after weighting seasons. */
  weightedOccupancyPct: number;
};

/** Year-average monthly short-term net from low / mid / high seasons. */
export function shortTermNetMonthlySeasonal(params: {
  seasons: Record<ShortTermSeasonId, ShortTermSeasonInputs>;
  platformFeePct: number;
  avgStayNights: number;
  cleaningPerTurnover: number;
  agencyFeePct?: number;
  taxPct?: number;
  utilitiesMonthly?: number;
}): ShortTermSeasonalNet {
  const ids: ShortTermSeasonId[] = ["low", "mid", "high"];
  const monthsSum = ids.reduce((s, id) => s + Math.max(0, params.seasons[id].months), 0);
  const denom = monthsSum > 0 ? monthsSum : 12;

  const bySeason = {} as Record<ShortTermSeasonId, ReturnType<typeof shortTermNetMonthly>>;
  let gross = 0;
  let platform = 0;
  let cleaning = 0;
  let agency = 0;
  let tax = 0;
  let utilities = 0;
  let net = 0;
  let weightedOcc = 0;

  for (const id of ids) {
    const season = params.seasons[id];
    const w = Math.max(0, season.months) / denom;
    const row = shortTermNetMonthly({
      nightlyRate: season.nightlyRate,
      occupancyPct: season.occupancyPct,
      platformFeePct: params.platformFeePct,
      avgStayNights: params.avgStayNights,
      cleaningPerTurnover: params.cleaningPerTurnover,
      agencyFeePct: params.agencyFeePct,
      taxPct: params.taxPct,
      utilitiesMonthly: params.utilitiesMonthly,
    });
    bySeason[id] = row;
    gross += row.gross * w;
    platform += row.platform * w;
    cleaning += row.cleaning * w;
    agency += row.agency * w;
    tax += row.tax * w;
    utilities += row.utilities * w;
    net += row.net * w;
    const occRaw = Math.max(0, season.occupancyPct);
    weightedOcc += (occRaw > 1 ? occRaw : occRaw * 100) * w;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    gross: round2(gross),
    platform: round2(platform),
    cleaning: round2(cleaning),
    agency: round2(agency),
    tax: round2(tax),
    utilities: round2(utilities),
    net: round2(net),
    bySeason,
    weightedOccupancyPct: round2(weightedOcc),
  };
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
