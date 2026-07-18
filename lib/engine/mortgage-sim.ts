import { frenchAmortizationSchedule, monthlyMortgagePayment } from "./mortgage";
import { round2 } from "./helpers";
import { propertyValueAtMonth } from "@/lib/market-cagr";

/** Full simulation horizon in years (independent of mortgage term). */
export const MORTGAGE_SIM_HORIZON_YEARS = 50;

/** Assumed ETF annual return for “invest the difference” line. */
export const MORTGAGE_SIM_ETF_RETURN_PCT = 10;

export interface MortgageSimPoint {
  month: number;
  year: number;
  /** Property value after revaluation at this month. */
  propertyValue: number;
  /** Property value + cumulative rent paid by tenant. */
  propertyValuePlusRent: number;
  /** Property value + cumulative rent avoided by living in the home. */
  propertyValuePlusRentSaved: number;
  /** Equity without revaluation: purchase price − remaining balance. */
  equity: number;
  /** Equity with revaluation: property value − remaining balance. */
  equityGrown: number;
  cumulativeInterest: number;
  /** Cumulative property tax + maintenance paid so far. */
  cumulativeCosts: number;
  /** Cumulative mortgage amount paid by the tenant. */
  cumulativeTenantCover: number;
  /** Cumulative rent you would have paid as a tenant elsewhere. */
  cumulativeRentAvoided: number;
  /** Owning cash paid − renting cash paid (positive ⇒ owning costs more). */
  ownMinusRent: number;
  /** Money saved chart series: owning − renting (= ownMinusRent). */
  moneySaved: number;
  /** moneySaved cashflows invested monthly in an ETF at MORTGAGE_SIM_ETF_RETURN_PCT. */
  etfFromSaved: number;
  /** Owner cash paid so far: down payment + owner share of mortgage + recurring. */
  totalPaid: number;
  remainingBalance: number;
  /** Interest portion of the installment in this month (0 at purchase / after loan). */
  monthInterest: number;
  /** Principal / equity portion of the installment in this month (0 at purchase / after loan). */
  monthPrincipal: number;
  /** Property tax + maintenance for this month (0 at purchase). */
  monthCosts: number;
  /** Tenant contribution toward the mortgage this month (0 if not renting / after loan). */
  monthTenantCover: number;
  monthlyPayment: number;
}

export interface MortgageSimResult {
  loanAmount: number;
  monthlyPayment: number;
  /** Property tax + maintenance, monthly. */
  monthlyRecurring: number;
  /** What you pay each month after tenant coverage + recurring expenses (during loan). */
  ownerMonthlyNet: number;
  /** Tenant contribution toward the monthly mortgage. */
  tenantMonthlyCover: number;
  /** Monthly rent avoided by living in the property (starting amount). */
  monthlyRentAvoided: number;
  /** Total rent avoided over the full horizon. */
  totalRentAvoided: number;
  /** Simulation horizon in years (always 50). */
  horizonYears: number;
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
  /** CAGR as fraction over the full horizon. */
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

/** Sum of monthly rents with annual growth (compounded monthly). */
export function cumulativeRentAvoidedWithGrowth(
  baseMonthly: number,
  months: number,
  annualGrowthPct: number,
): number {
  const base = Math.max(0, baseMonthly);
  const n = Math.max(0, Math.floor(months));
  if (base <= 0 || n <= 0) return 0;
  const monthlyFactor = Math.pow(1 + annualGrowthPct / 100, 1 / 12);
  if (Math.abs(monthlyFactor - 1) < 1e-12) return round2(base * n);
  return round2((base * (1 - Math.pow(monthlyFactor, n))) / (1 - monthlyFactor));
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
  /** When true, count rent you would otherwise pay as a tenant. */
  liveInEnabled?: boolean;
  /** Monthly rent avoided by living in the home (starting amount). */
  monthlyRentAvoided?: number;
  /** Annual growth of avoided rent %, e.g. 2. */
  rentGrowthPct?: number;
  /** Maintenance as fraction of purchase price / year (e.g. 0.01 = 1%). */
  maintenancePct?: number;
  /** Annual property tax (€ or CZK). */
  propertyTaxAnnual?: number;
}): MortgageSimResult {
  const price = Math.max(0, params.price);
  const downPayment = Math.min(Math.max(0, params.downPayment), price);
  const loanYears = Math.max(0, Math.floor(params.years));
  const horizonYears = MORTGAGE_SIM_HORIZON_YEARS;
  const horizonMonths = horizonYears * 12;
  const annualRate = Math.max(0, params.annualRate);
  const annualAppreciationPct = Number.isFinite(params.annualAppreciationPct)
    ? (params.annualAppreciationPct as number)
    : 0;
  const rentEnabled = params.rentEnabled === true;
  const liveInEnabled = params.liveInEnabled === true && !rentEnabled;
  const maintenancePct = Math.max(0, params.maintenancePct ?? 0);
  const propertyTaxAnnual = Math.max(0, params.propertyTaxAnnual ?? 0);
  const annualRecurring = propertyTaxAnnual + price * maintenancePct;
  const monthlyRecurring = round2(annualRecurring / 12);
  const loanAmount = round2(Math.max(0, price - downPayment));
  const monthlyRentAvoided = liveInEnabled
    ? round2(Math.max(0, params.monthlyRentAvoided ?? 0))
    : 0;
  const rentGrowthPct = liveInEnabled
    ? Number.isFinite(params.rentGrowthPct)
      ? (params.rentGrowthPct as number)
      : 0
    : 0;

  const schedule = frenchAmortizationSchedule(loanAmount, annualRate, loanYears);
  const loanMonths = schedule.length;
  const monthlyPayment = monthlyMortgagePayment(loanAmount, annualRate, loanYears);
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
  const etfMonthlyFactor = Math.pow(1 + MORTGAGE_SIM_ETF_RETURN_PCT / 100, 1 / 12);
  let etfFromSaved = 0;
  let prevOwnCash = downPayment;
  let prevRentCash = 0;

  const owningCashAt = (month: number) => {
    const mortgageCash = cumulativePrincipal + cumulativeInterest;
    const cumulativeCosts = (annualRecurring * month) / 12;
    return round2(downPayment + mortgageCash * ownerShare + cumulativeCosts);
  };

  const rentCashAt = (month: number) =>
    cumulativeRentAvoidedWithGrowth(monthlyRentAvoided, month, rentGrowthPct);

  /** One month of ETF growth + invest this month’s (own − rent) cashflow delta. */
  const stepEtfMonth = (month: number) => {
    const own = owningCashAt(month);
    const rent = rentCashAt(month);
    const monthlyDiff = own - prevOwnCash - (rent - prevRentCash);
    etfFromSaved = etfFromSaved * etfMonthlyFactor + monthlyDiff;
    prevOwnCash = own;
    prevRentCash = rent;
  };

  const push = (
    month: number,
    year: number,
    remainingBalance: number,
    monthInterest: number,
    monthPrincipal: number,
    payment: number,
    tenantThisMonth: number,
  ) => {
    const propertyValue = round2(
      propertyValueAtMonth(price, month, annualAppreciationPct),
    );
    const equity = round2(Math.max(0, price - remainingBalance));
    const equityGrown = round2(Math.max(0, propertyValue - remainingBalance));
    const mortgageCash = cumulativePrincipal + cumulativeInterest;
    const cumulativeCosts = round2((annualRecurring * month) / 12);
    const loanMonthsActive = Math.min(month, loanMonths);
    const cumulativeTenantCover = round2(tenantMonthlyCover * loanMonthsActive);
    const cumulativeRentAvoided = rentCashAt(month);
    const totalPaid = owningCashAt(month);
    const ownMinusRent = round2(totalPaid - cumulativeRentAvoided);
    const moneySaved = ownMinusRent;
    points.push({
      month,
      year,
      propertyValue,
      propertyValuePlusRent: round2(propertyValue + cumulativeTenantCover),
      propertyValuePlusRentSaved: round2(propertyValue + cumulativeRentAvoided),
      equity,
      equityGrown,
      cumulativeInterest: round2(cumulativeInterest),
      cumulativeCosts,
      cumulativeTenantCover,
      cumulativeRentAvoided,
      ownMinusRent,
      moneySaved,
      etfFromSaved: round2(etfFromSaved),
      totalPaid,
      remainingBalance: round2(remainingBalance),
      monthInterest: round2(monthInterest),
      monthPrincipal: round2(monthPrincipal),
      monthCosts: month === 0 ? 0 : monthlyRecurring,
      monthTenantCover: round2(tenantThisMonth),
      monthlyPayment: round2(payment),
    });
  };

  push(0, 0, loanAmount, 0, 0, 0, 0);

  const finish = () => {
    const last = points[points.length - 1]!;
    return {
      loanAmount,
      monthlyPayment: round2(monthlyPayment),
      monthlyRecurring,
      ownerMonthlyNet,
      tenantMonthlyCover,
      monthlyRentAvoided,
      totalRentAvoided: last.cumulativeRentAvoided,
      horizonYears,
      firstMonthInterest,
      firstMonthPrincipal,
      points,
      totalInterest: round2(cumulativeInterest),
      finalEquity: round2(last.equityGrown),
      finalPropertyValue: last.propertyValue,
      totalCashPaid: last.totalPaid,
      cagr: mortgageEquityCagr(last.totalPaid, last.equityGrown, horizonYears),
    };
  };

  if (loanMonths === 0) {
    for (let month = 1; month <= horizonMonths; month++) {
      stepEtfMonth(month);
      if (month % 12 === 0 || month === horizonMonths) {
        push(month, Math.ceil(month / 12), 0, 0, 0, 0, 0);
      }
    }
    return finish();
  }

  for (let i = 0; i < loanMonths; i++) {
    const row = schedule[i]!;
    cumulativeInterest += row.interest;
    cumulativePrincipal += row.principal;
    const month = i + 1;
    if (month > horizonMonths) break;
    stepEtfMonth(month);
    const isYearEnd = month % 12 === 0;
    const isLastLoan = month === loanMonths || month === horizonMonths;
    if (isYearEnd || isLastLoan) {
      push(
        month,
        Math.ceil(month / 12),
        row.balance,
        row.interest,
        row.principal,
        row.payment,
        tenantMonthlyCover,
      );
    }
  }

  const lastLoanMonth = Math.min(loanMonths, horizonMonths);
  for (let month = lastLoanMonth + 1; month <= horizonMonths; month++) {
    stepEtfMonth(month);
    if (month % 12 === 0 || month === horizonMonths) {
      push(month, Math.ceil(month / 12), 0, 0, 0, 0, 0);
    }
  }

  return finish();
}
