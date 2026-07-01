import type { InvestmentScenario } from "../types";
import { effectiveCadastralValue, effectiveCedolareRate } from "./helpers";

export function computeImuAnnual(scenario: InvestmentScenario): number {
  let rate = scenario.operating.imu_rate;
  if (
    scenario.rental.rental_mode === "short_term_airbnb" &&
    scenario.operating.affitti_brevi_imu_surcharge
  ) {
    rate += scenario.operating.affitti_brevi_imu_surcharge_rate;
  }
  return effectiveCadastralValue(scenario) * rate;
}

export function computeRentalTax(grossRent: number, scenario: InvestmentScenario): number {
  if (scenario.tax.tax_regime === "irpef" || scenario.tax.use_irpef) {
    return grossRent * 0.23;
  }
  return grossRent * effectiveCedolareRate(scenario);
}
