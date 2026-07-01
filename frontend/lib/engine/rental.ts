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

/** Commissione agenzia: calcolata sul canone pieno, non sul canone scontato per vacanza */
export function monthlyAgencyFee(scenario: InvestmentScenario): number {
  if (scenario.rental.rental_mode === "short_term_airbnb") return 0;
  const fullRent = scenario.rental.monthly_rent ?? 0;
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
