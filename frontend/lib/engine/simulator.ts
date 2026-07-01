import type {
  AnalysisResult,
  AnnualSummary,
  InvestmentScenario,
  MonthlyCashFlowPoint,
} from "../types";
import { round2 } from "./helpers";
import { frenchAmortizationSchedule, monthlyMortgagePayment } from "./mortgage";
import { computePurchaseCosts } from "./purchase";
import {
  monthlyAgencyFee,
  monthlyCleaningFee,
  monthlyFixedOpex,
  monthlyGrossRent,
  monthlyPlatformFee,
  monthlyTurnoverFee,
} from "./rental";
import { computeRentalTax } from "./taxes";

export function runSimulation(scenario: InvestmentScenario): AnalysisResult {
  const purchaseCosts = computePurchaseCosts(scenario);
  const initialCash = purchaseCosts.total_initial_cash;

  const mortgageSchedule = frenchAmortizationSchedule(
    purchaseCosts.loan_amount,
    scenario.financing.interest_rate_annual,
    scenario.financing.loan_years,
  );
  const monthlyPayment = monthlyMortgagePayment(
    purchaseCosts.loan_amount,
    scenario.financing.interest_rate_annual,
    scenario.financing.loan_years,
  );

  const totalMonths = scenario.projection_years * 12;
  const monthlySeries: MonthlyCashFlowPoint[] = [];
  let cumulative = -initialCash;
  let propertyValue = scenario.property.purchase_price;
  const fixedOpex = monthlyFixedOpex(scenario);

  for (let monthIdx = 0; monthIdx < totalMonths; monthIdx++) {
    const monthNum = monthIdx + 1;
    const year = Math.floor(monthIdx / 12) + 1;

    if (monthIdx > 0 && monthIdx % 12 === 0) {
      propertyValue *= 1 + scenario.price_appreciation_annual;
    }

    const mtg = monthIdx < mortgageSchedule.length ? mortgageSchedule[monthIdx] : null;
    const grossRent = monthlyGrossRent(scenario);
    const platformFee = monthlyPlatformFee(grossRent, scenario);
    const cleaningFee = monthlyCleaningFee(scenario) + monthlyTurnoverFee(scenario);
    const agencyFee = monthlyAgencyFee(scenario);
    const rentalTax = computeRentalTax(grossRent, scenario);

    const totalOpex =
      platformFee +
      cleaningFee +
      agencyFee +
      fixedOpex.imu +
      fixedOpex.tari +
      fixedOpex.condominio +
      fixedOpex.insurance +
      fixedOpex.maintenance +
      fixedOpex.utilities;

    const mortgagePayment = mtg?.payment ?? 0;
    const netCashFlow = grossRent - totalOpex - rentalTax - mortgagePayment;
    cumulative += netCashFlow;

    monthlySeries.push({
      month: monthNum,
      year,
      gross_rent: round2(grossRent),
      platform_fee: round2(platformFee),
      cleaning_fee: round2(cleaningFee),
      agency_fee: round2(agencyFee),
      imu: round2(fixedOpex.imu),
      tari: round2(fixedOpex.tari),
      condominio: round2(fixedOpex.condominio),
      insurance: round2(fixedOpex.insurance),
      maintenance: round2(fixedOpex.maintenance),
      utilities: round2(fixedOpex.utilities),
      rental_tax: round2(rentalTax),
      mortgage_payment: round2(mortgagePayment),
      mortgage_interest: round2(mtg?.interest ?? 0),
      mortgage_principal: round2(mtg?.principal ?? 0),
      net_cash_flow: round2(netCashFlow),
      cumulative_cash_flow: round2(cumulative),
      mortgage_balance: round2(mtg?.balance ?? 0),
      property_value: round2(propertyValue),
    });
  }

  const breakEvenMonth = monthlySeries.find((p) => p.cumulative_cash_flow >= 0)?.month ?? null;
  const annualSeries = buildAnnualSummary(monthlySeries);

  const year1Points = monthlySeries.filter((p) => p.year === 1);
  const year5Points = monthlySeries.filter((p) => p.year === 5);
  const year1Cf = year1Points.reduce((s, p) => s + p.net_cash_flow, 0);
  const year5Cf = year5Points.reduce((s, p) => s + p.net_cash_flow, 0);

  const last = monthlySeries[monthlySeries.length - 1];
  const finalEquity = last.property_value - last.mortgage_balance;
  const totalNetCf = monthlySeries.reduce((s, p) => s + p.net_cash_flow, 0);

  // Profitto totale = flussi operativi + equity finale − capitale versato
  const totalProfit = totalNetCf + finalEquity - initialCash;
  const totalRoiPct = initialCash > 0 ? (totalProfit / initialCash) * 100 : 0;

  const year1Gross = year1Points.reduce((s, p) => s + p.gross_rent, 0);
  const grossYieldPct = (year1Gross / scenario.property.purchase_price) * 100;

  return {
    summary: {
      initial_cash_required: initialCash,
      loan_amount: purchaseCosts.loan_amount,
      monthly_mortgage_payment: monthlyPayment,
      break_even_month: breakEvenMonth,
      year_1_net_cash_flow: round2(year1Cf),
      year_5_net_cash_flow: round2(year5Cf),
      total_roi_pct: round2(totalRoiPct),
      cash_on_cash_return_pct: round2(initialCash > 0 ? (year1Cf / initialCash) * 100 : 0),
      net_yield_pct: round2(grossYieldPct),
      purchase_costs: purchaseCosts,
    },
    monthly_series: monthlySeries,
    annual_series: annualSeries,
  };
}

function buildAnnualSummary(monthlySeries: MonthlyCashFlowPoint[]): AnnualSummary[] {
  const years = [...new Set(monthlySeries.map((p) => p.year))].sort((a, b) => a - b);
  return years.map((year) => {
    const points = monthlySeries.filter((p) => p.year === year);
    const last = points[points.length - 1];
    const totalOpex = points.reduce(
      (s, p) =>
        s +
        p.platform_fee +
        p.cleaning_fee +
        p.agency_fee +
        p.imu +
        p.tari +
        p.condominio +
        p.insurance +
        p.maintenance +
        p.utilities,
      0,
    );
    return {
      year,
      gross_rent: round2(points.reduce((s, p) => s + p.gross_rent, 0)),
      total_opex: round2(totalOpex),
      rental_tax: round2(points.reduce((s, p) => s + p.rental_tax, 0)),
      mortgage_payment: round2(points.reduce((s, p) => s + p.mortgage_payment, 0)),
      mortgage_interest: round2(points.reduce((s, p) => s + p.mortgage_interest, 0)),
      mortgage_principal: round2(points.reduce((s, p) => s + p.mortgage_principal, 0)),
      net_cash_flow: round2(points.reduce((s, p) => s + p.net_cash_flow, 0)),
      cumulative_cash_flow: last.cumulative_cash_flow,
      mortgage_balance: last.mortgage_balance,
      property_value: last.property_value,
      equity: round2(last.property_value - last.mortgage_balance),
    };
  });
}
