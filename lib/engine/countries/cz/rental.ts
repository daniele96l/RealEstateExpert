import type { InvestmentScenario } from "../../../types";
import { effectiveMaintenancePct, effectiveOccupancyRate } from "../../helpers";
import { computePropertyTaxAnnualCz } from "./taxes";

export function monthlyFixedOpexCz(scenario: InvestmentScenario) {
  const propertyTax = computePropertyTaxAnnualCz(scenario) / 12;
  return {
    imu: 0,
    tari: propertyTax,
    condominio: scenario.operating.condominio_monthly,
    insurance: scenario.operating.insurance_annual / 12,
    maintenance:
      (scenario.property.purchase_price * effectiveMaintenancePct(scenario)) / 12,
    utilities: scenario.operating.utilities_landlord_annual / 12,
  };
}

export function monthlyGrossRentCz(scenario: InvestmentScenario): number {
  const occupancy = effectiveOccupancyRate(scenario);
  if (scenario.rental.rental_mode !== "short_term_airbnb") {
    return (scenario.rental.monthly_rent ?? 0) * occupancy;
  }
  return (scenario.rental.nightly_rate ?? 0) * 30 * occupancy;
}
