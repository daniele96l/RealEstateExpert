import type { InvestmentScenario } from "../../../types";

/** Simplified Czech property tax — stored in tari_annual (annual lump sum) */
export function computePropertyTaxAnnualCz(scenario: InvestmentScenario): number {
  return scenario.operating.tari_annual;
}

/** Flat income tax on gross rent (v1 simplified model) */
export function computeRentalTaxCz(grossRent: number, scenario: InvestmentScenario): number {
  const rate = scenario.tax.cedolare_rate ?? 0.15;
  return grossRent * rate;
}
