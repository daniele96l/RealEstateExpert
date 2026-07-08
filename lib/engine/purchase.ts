import type { InvestmentScenario, PurchaseCostBreakdown } from "../types";
import { applyNotaryFeeFloor } from "../constants";
import {
  effectiveCadastralValue,
  effectiveLoanAmount,
  effectiveRegistrationTaxPct,
  equityDownPayment,
  round2,
} from "./helpers";

export function computePurchaseCosts(scenario: InvestmentScenario): PurchaseCostBreakdown {
  const price = scenario.property.purchase_price;
  const cadastral = effectiveCadastralValue(scenario);
  const registrationTax = cadastral * (effectiveRegistrationTaxPct(scenario) / 100);
  const vat = price * (scenario.property.vat_pct / 100);
  const loanAmount = effectiveLoanAmount(scenario);
  const notary = applyNotaryFeeFloor(
    price * (scenario.property.notary_pct / 100),
    loanAmount > 0,
  );
  const agency = price * (scenario.property.agency_pct / 100);
  const downPayment = equityDownPayment(scenario);
  const renovation = scenario.renovation.renovation_cost;
  const furnishing = scenario.renovation.furnishing_cost;

  return {
    down_payment: round2(downPayment),
    registration_tax: round2(registrationTax),
    vat: round2(vat),
    notary: round2(notary),
    agency: round2(agency),
    renovation: round2(renovation),
    furnishing: round2(furnishing),
    total_initial_cash: round2(downPayment + registrationTax + vat + notary + agency),
    loan_amount: round2(loanAmount),
  };
}
