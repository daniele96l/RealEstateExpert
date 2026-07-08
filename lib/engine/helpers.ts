import type { InvestmentScenario } from "../types";
import { ITALY_DEFAULTS } from "../constants";

export function effectiveCadastralValue(s: InvestmentScenario): number {
  return s.property.cadastral_value ?? s.property.purchase_price * ITALY_DEFAULTS.cadastral_ratio;
}

/** Imposta di registro: calcolata sul valore catastale (non sul prezzo) */
export function effectiveRegistrationTaxPct(s: InvestmentScenario): number {
  if (s.property.registration_tax_pct != null) return s.property.registration_tax_pct;
  return s.property.property_type === "prima_casa"
    ? ITALY_DEFAULTS.registration_tax_pct_prima_casa
    : ITALY_DEFAULTS.registration_tax_pct_investment;
}

export function effectiveOccupancyRate(s: InvestmentScenario): number {
  if (s.rental.occupancy_rate != null) return s.rental.occupancy_rate;
  if (s.rental.rental_mode === "long_term") return 0.92;
  if (s.rental.rental_mode === "medium_term_semester") return 0.82;
  return 0.65;
}

export function effectiveCedolareRate(s: InvestmentScenario): number {
  if (s.tax.cedolare_rate != null) return s.tax.cedolare_rate;
  if (s.rental.rental_mode === "long_term" || s.rental.rental_mode === "medium_term_semester") {
    return ITALY_DEFAULTS.cedolare_long;
  }
  return ITALY_DEFAULTS.cedolare_short_first_property;
}

export function effectiveMaintenancePct(s: InvestmentScenario): number {
  if (s.operating.property_manager_fee_pct > 0) return 0;
  if (s.operating.maintenance_pct != null) return s.operating.maintenance_pct;
  if (s.rental.rental_mode === "long_term") return ITALY_DEFAULTS.maintenance_pct_long;
  if (s.rental.rental_mode === "medium_term_semester") return ITALY_DEFAULTS.maintenance_pct_medium;
  return ITALY_DEFAULTS.maintenance_pct_short;
}

export function financedProjectTotal(s: InvestmentScenario): number {
  return (
    s.property.purchase_price +
    s.renovation.renovation_cost +
    s.renovation.furnishing_cost
  );
}

export function equityDownPayment(s: InvestmentScenario): number {
  return financedProjectTotal(s) * (s.financing.down_payment_pct / 100);
}

export function effectiveLoanAmount(s: InvestmentScenario): number {
  if (s.financing.loan_amount != null) return s.financing.loan_amount;
  return Math.max(0, financedProjectTotal(s) - equityDownPayment(s));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
