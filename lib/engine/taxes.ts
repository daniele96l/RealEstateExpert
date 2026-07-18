import type { InvestmentScenario } from "../types";
import { effectiveCadastralValue, effectiveCedolareRate, round2 } from "./helpers";
import {
  computeCedolareConcordato10,
  computeIrpefOrdinaryWithBonus,
  CONCORDATO_IMU_FACTOR,
  REGGIO_IMU_ORDINARY_RATE,
} from "./italy-tax-aire";

export {
  annualRenovationBonusQuota,
  computeCedolareConcordato10,
  computeIrpefOrdinaryWithBonus,
  computeIrpefProgressive,
  CONCORDATO_IMU_FACTOR,
  REGGIO_IMU_ORDINARY_RATE,
  RENOVATION_BONUS_RATE,
  RENOVATION_BONUS_YEARS,
} from "./italy-tax-aire";

/** Cedolare 10% ⇒ contratto a canone concordato (IMU −25%). */
export function isCanoneConcordato(scenario: InvestmentScenario): boolean {
  if (scenario.tax.tax_regime === "irpef" || scenario.tax.use_irpef) return false;
  const rate = effectiveCedolareRate(scenario);
  return Math.abs(rate - 0.1) < 1e-9;
}

export function computeImuAnnual(scenario: InvestmentScenario): number {
  let rate = scenario.operating.imu_rate;
  if (
    scenario.rental.rental_mode === "short_term_airbnb" &&
    scenario.operating.affitti_brevi_imu_surcharge
  ) {
    rate += scenario.operating.affitti_brevi_imu_surcharge_rate;
  }

  let imu = effectiveCadastralValue(scenario) * rate;
  if (isCanoneConcordato(scenario)) {
    imu *= CONCORDATO_IMU_FACTOR;
  }
  return round2(imu);
}

/**
 * Imposta annuale sugli affitti (quota mensile = / 12 nel cash-flow).
 *
 * - IRPEF: imponibile 95% + scaglioni − bonus ristrutturazione (con floor a 0).
 * - Cedolare 10% (concordato): 10% sul canone; bonus non recuperabile se AIRE incapiente.
 * - Altra cedolare: aliquota piatta sul canone.
 */
export function computeRentalTax(grossRentMonthly: number, scenario: InvestmentScenario): number {
  const annualRent = grossRentMonthly * 12;
  const cadastral = effectiveCadastralValue(scenario);
  const renovationSpend = scenario.renovation.renovation_cost;

  if (scenario.tax.tax_regime === "irpef" || scenario.tax.use_irpef) {
    const result = computeIrpefOrdinaryWithBonus({
      annualRentFree: annualRent,
      cadastralValue: cadastral,
      renovationSpend,
      otherIrpefIncome: 0,
      imuRate: scenario.operating.imu_rate,
    });
    return result.netTax / 12;
  }

  if (isCanoneConcordato(scenario)) {
    const result = computeCedolareConcordato10({
      annualRentConcordato: annualRent,
      cadastralValue: cadastral,
      renovationSpend,
      imuRate: scenario.operating.imu_rate,
      cedolareRate: 0.1,
    });
    return result.cedolareTax / 12;
  }

  return annualRent * effectiveCedolareRate(scenario) / 12;
}

/** Breakdown annuale utile per UI / debug AIRE. */
export function computeAnnualTaxBreakdown(scenario: InvestmentScenario, annualRent: number) {
  const cadastral = effectiveCadastralValue(scenario);
  const renovationSpend = scenario.renovation.renovation_cost;
  const imuRate = scenario.operating.imu_rate || REGGIO_IMU_ORDINARY_RATE;

  if (scenario.tax.tax_regime === "irpef" || scenario.tax.use_irpef) {
    return {
      regime: "irpef_ordinario" as const,
      ...computeIrpefOrdinaryWithBonus({
        annualRentFree: annualRent,
        cadastralValue: cadastral,
        renovationSpend,
        imuRate,
      }),
    };
  }

  if (isCanoneConcordato(scenario)) {
    return {
      regime: "cedolare_concordato_10" as const,
      ...computeCedolareConcordato10({
        annualRentConcordato: annualRent,
        cadastralValue: cadastral,
        renovationSpend,
        imuRate,
      }),
    };
  }

  const rate = effectiveCedolareRate(scenario);
  const tax = round2(annualRent * rate);
  const imu = computeImuAnnual(scenario);
  return {
    regime: "cedolare_secca" as const,
    annualRent,
    cedolareTax: tax,
    netTax: tax,
    imu,
    totalAnnualTaxBurden: round2(tax + imu),
    bonusUsed: 0,
    bonusLost: 0,
  };
}
