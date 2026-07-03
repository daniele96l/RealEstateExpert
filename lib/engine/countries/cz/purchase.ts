import type { InvestmentScenario, PurchaseCostBreakdown } from "../../../types";
import { equityDownPayment, effectiveLoanAmount, round2 } from "../../helpers";

/** Czech purchase costs — no transfer tax on standard residential (since 2020) */
export function computePurchaseCostsCz(scenario: InvestmentScenario): PurchaseCostBreakdown {
  const price = scenario.property.purchase_price;
  const registrationTax = 0;
  const vat = price * (scenario.property.vat_pct / 100);
  const notary = price * (scenario.property.notary_pct / 100);
  const agency = price * (scenario.property.agency_pct / 100);
  const downPayment = equityDownPayment(scenario);
  const renovation = scenario.renovation.renovation_cost;
  const furnishing = scenario.renovation.furnishing_cost;
  const loanAmount = effectiveLoanAmount(scenario);

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
