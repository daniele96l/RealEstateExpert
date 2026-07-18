import { frenchAmortizationSchedule, monthlyMortgagePayment } from "./mortgage";
import { round2 } from "./helpers";
import { propertyValueAtMonth } from "@/lib/market-cagr";

export interface MortgageSimPoint {
  month: number;
  year: number;
  /** Property value after revaluation at this month. */
  propertyValue: number;
  /** Property value + cumulative rent paid by tenant. */
  propertyValuePlusRent: number;
  /** Equity without revaluation: purchase price − remaining balance. */
  equity: number;
  /** Equity with revaluation: property value − remaining balance. */
  equityGrown: number;
  cumulativeInterest: number;
  /** Cumulative property tax + maintenance paid so far. */
  cumulativeCosts: number;
  /** Cumulative mortgage amount paid by the tenant. */
  cumulativeTenantCover: number;
  /** Owner cash paid so far: down payment + owner share of mortgage + recurring. */
  totalPaid: number;
  remainingBalance: number;
  /** Interest portion of the installment in this month (0 at purchase). */
  monthInterest: number;
  /** Principal / equity portion of the installment in this month (0 at purchase). */
  monthPrincipal: number;
  /** Property tax + maintenance for this month (0 at purchase). */
  monthCosts: number;
  /** Tenant contribution toward the mortgage this month (0 if not renting). */
  monthTenantCover: number;
  monthlyPayment: number;
}

export interface MortgageSimResult {
  loanAmount: number;
  monthlyPayment: number;
  /** Property tax + maintenance, monthly. */
  monthlyRecurring: number;
  /** What you pay each month after tenant coverage + recurring expenses. */
  ownerMonthlyNet: number;
  /** Tenant contribution toward the monthly mortgage. */
  tenantMonthlyCover: number;
  /** First installment: interest to bank. */
  firstMonthInterest: number;
  /** First installment: principal building equity. */
  firstMonthPrincipal: number;
  points: MortgageSimPoint[];
  totalInterest: number;
  finalEquity: number;
  finalPropertyValue: number;
  /** Owner cash paid (down payment + owner share of mortgage + recurring). */
  totalCashPaid: number;
  /** CAGR as fraction (e.g. 0.052 = 5.2%), or null if undefined. */
  cagr: number | null;
}

export function mortgageEquityCagr(
  totalCashPaid: number,
  finalEquity: number,
  years: number,
): number | null {
  if (totalCashPaid <= 0 || years <= 0 || finalEquity <= 0) return null;
  return Math.pow(finalEquity / totalCashPaid, 1 / years) - 1;
}

export function buildMortgageSimSeries(params: {
  price: number;
  downPayment: number;
  annualRate: number;
  years: number;
  /** Annual house revaluation / inflation %, e.g. 2. */
  annualAppreciationPct?: number;
  /** When true, tenant covers part of the mortgage payment. */
  rentEnabled?: boolean;
  /** Absolute monthly amount covered by tenant (clamped to the installment). */
  tenantMonthlyAmount?: number;
  /** Maintenance as fraction of purchase price / year (e.g. 0.01 = 1%). */
  maintenancePct?: number;
  /** Annual property tax (€ or CZK). */
  propertyTaxAnnual?: number;
}): MortgageSimResult {
  const price = Math.max(0, params.price);
  const downPayment = Math.min(Math.max(0, params.downPayment), price);
  const years = Math.max(0, Math.floor(params.years));
  const annualRate = Math.max(0, params.annualRate);
  const annualAppreciationPct = Number.isFinite(params.annualAppreciationPct)
    ? (params.annualAppreciationPct as number)
    : 0;
  const rentEnabled = params.rentEnabled === true;
  const maintenancePct = Math.max(0, params.maintenancePct ?? 0);
  const propertyTaxAnnual = Math.max(0, params.propertyTaxAnnual ?? 0);
  const annualRecurring = propertyTaxAnnual + price * maintenancePct;
  const monthlyRecurring = round2(annualRecurring / 12);
  const loanAmount = round2(Math.max(0, price - downPayment));

  const schedule = frenchAmortizationSchedule(loanAmount, annualRate, years);
  const monthlyPayment = monthlyMortgagePayment(loanAmount, annualRate, years);
  const first = schedule[0];
  const firstMonthInterest = round2(first?.interest ?? 0);
  const firstMonthPrincipal = round2(first?.principal ?? 0);
  const tenantMonthlyCover =
    rentEnabled && monthlyPayment > 0
      ? round2(
          Math.min(
            monthlyPayment,
            Math.max(0, params.tenantMonthlyAmount ?? 0),
          ),
        )
      : 0;
  const ownerShare =
    monthlyPayment > 0 ? 1 - tenantMonthlyCover / monthlyPayment : 1;
  const ownerMonthlyNet = round2(monthlyPayment * ownerShare + monthlyRecurring);

  const points: MortgageSimPoint[] = [];
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;

  const push = (
    month: number,
    year: number,
    remainingBalance: number,
    monthInterest: number,
    monthPrincipal: number,
    payment: number,
  ) => {
    const propertyValue = round2(
      propertyValueAtMonth(price, month, annualAppreciationPct),
    );
    const equity = round2(Math.max(0, price - remainingBalance));
    const equityGrown = round2(Math.max(0, propertyValue - remainingBalance));
    const mortgageCash = cumulativePrincipal + cumulativeInterest;
    const cumulativeCosts = round2((annualRecurring * month) / 12);
    const cumulativeTenantCover = round2(tenantMonthlyCover * month);
    const totalPaid = round2(downPayment + mortgageCash * ownerShare + cumulativeCosts);
    points.push({
      month,
      year,
      propertyValue,
      propertyValuePlusRent: round2(propertyValue + cumulativeTenantCover),
      equity,
      equityGrown,
      cumulativeInterest: round2(cumulativeInterest),
      cumulativeCosts,
      cumulativeTenantCover,
      totalPaid,
      remainingBalance: round2(remainingBalance),
      monthInterest: round2(monthInterest),
      monthPrincipal: round2(monthPrincipal),
      monthCosts: month === 0 ? 0 : monthlyRecurring,
      monthTenantCover: month === 0 ? 0 : tenantMonthlyCover,
      monthlyPayment: round2(payment),
    });
  };

  push(0, 0, loanAmount, 0, 0, 0);

  if (schedule.length === 0) {
    const months = Math.max(years, 1) * 12;
    const finalPropertyValue = round2(
      propertyValueAtMonth(price, months, annualAppreciationPct),
    );
    const cashPaid = round2(downPayment + (annualRecurring * months) / 12);
    return {
      loanAmount: 0,
      monthlyPayment: 0,
      monthlyRecurring,
      ownerMonthlyNet: monthlyRecurring,
      tenantMonthlyCover: 0,
      firstMonthInterest: 0,
      firstMonthPrincipal: 0,
      points: [
        {
          ...points[0]!,
          totalPaid: round2(downPayment),
          cumulativeCosts: 0,
          cumulativeTenantCover: 0,
          propertyValuePlusRent: points[0]!.propertyValue,
        },
        {
          month: months,
          year: Math.max(years, 1),
          propertyValue: finalPropertyValue,
          propertyValuePlusRent: finalPropertyValue,
          equity: price,
          equityGrown: finalPropertyValue,
          cumulativeInterest: 0,
          cumulativeCosts: round2((annualRecurring * months) / 12),
          cumulativeTenantCover: 0,
          totalPaid: cashPaid,
          remainingBalance: 0,
          monthInterest: 0,
          monthPrincipal: 0,
          monthCosts: monthlyRecurring,
          monthTenantCover: 0,
          monthlyPayment: 0,
        },
      ],
      totalInterest: 0,
      finalEquity: finalPropertyValue,
      finalPropertyValue,
      totalCashPaid: cashPaid,
      cagr: mortgageEquityCagr(cashPaid, finalPropertyValue, Math.max(years, 1)),
    };
  }

  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i]!;
    cumulativeInterest += row.interest;
    cumulativePrincipal += row.principal;
    const month = i + 1;
    const isYearEnd = month % 12 === 0;
    const isLast = month === schedule.length;
    if (isYearEnd || isLast) {
      push(
        month,
        Math.ceil(month / 12),
        row.balance,
        row.interest,
        row.principal,
        row.payment,
      );
    }
  }

  const last = points[points.length - 1]!;
  return {
    loanAmount,
    monthlyPayment: round2(monthlyPayment),
    monthlyRecurring,
    ownerMonthlyNet,
    tenantMonthlyCover,
    firstMonthInterest,
    firstMonthPrincipal,
    points,
    totalInterest: round2(cumulativeInterest),
    finalEquity: round2(last.equityGrown),
    finalPropertyValue: last.propertyValue,
    totalCashPaid: last.totalPaid,
    cagr: mortgageEquityCagr(last.totalPaid, last.equityGrown, years),
  };
}
