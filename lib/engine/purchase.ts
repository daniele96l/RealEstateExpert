import type { InvestmentScenario, PurchaseCostBreakdown } from "../types";
import {
  effectiveCadastralValue,
  effectiveLoanAmount,
  effectiveRegistrationTaxPct,
  round2,
} from "./helpers";

export function computePurchaseCosts(scenario: InvestmentScenario): PurchaseCostBreakdown {
  const price = scenario.property.purchase_price;
  const cadastral = effectiveCadastralValue(scenario);
  const registrationTax = cadastral * (effectiveRegistrationTaxPct(scenario) / 100);
  const vat = price * (scenario.property.vat_pct / 100);
  const notary = price * (scenario.property.notary_pct / 100);
  const agency = price * (scenario.property.agency_pct / 100);
  const downPayment = price * (scenario.financing.down_payment_pct / 100);
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
    total_initial_cash: round2(
      downPayment + registrationTax + vat + notary + agency + renovation + furnishing,
    ),
    loan_amount: round2(loanAmount),
  };
}
