import { frenchAmortizationSchedule, monthlyMortgagePayment } from "./mortgage";
import { round2 } from "./helpers";
import { propertyValueAtMonth } from "@/lib/market-cagr";

export interface MortgageSimPoint {
  month: number;
  year: number;
  /** Property value after revaluation at this month. */
  propertyValue: number;
  /** Equity = property value − remaining mortgage balance. */
  equity: number;
  cumulativeInterest: number;
  /** Cash paid so far: down payment + principal + interest. */
  totalPaid: number;
  remainingBalance: number;
  /** Interest portion of the installment in this month (0 at purchase). */
  monthInterest: number;
  /** Principal / equity portion of the installment in this month (0 at purchase). */
  monthPrincipal: number;
  monthlyPayment: number;
}

export interface MortgageSimResult {
  loanAmount: number;
  monthlyPayment: number;
  /** First installment: interest to bank. */
  firstMonthInterest: number;
  /** First installment: principal building equity. */
  firstMonthPrincipal: number;
  points: MortgageSimPoint[];
  totalInterest: number;
  finalEquity: number;
  finalPropertyValue: number;
  /** Total cash paid (down payment + principal + interest). */
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
}): MortgageSimResult {
  const price = Math.max(0, params.price);
  const downPayment = Math.min(Math.max(0, params.downPayment), price);
  const years = Math.max(0, Math.floor(params.years));
  const annualRate = Math.max(0, params.annualRate);
  const annualAppreciationPct = Number.isFinite(params.annualAppreciationPct)
    ? (params.annualAppreciationPct as number)
    : 2;
  const loanAmount = round2(Math.max(0, price - downPayment));

  const schedule = frenchAmortizationSchedule(loanAmount, annualRate, years);
  const monthlyPayment = monthlyMortgagePayment(loanAmount, annualRate, years);
  const first = schedule[0];
  const firstMonthInterest = round2(first?.interest ?? 0);
  const firstMonthPrincipal = round2(first?.principal ?? 0);

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
    const equity = round2(Math.max(0, propertyValue - remainingBalance));
    const totalPaid = round2(downPayment + cumulativePrincipal + cumulativeInterest);
    points.push({
      month,
      year,
      propertyValue,
      equity,
      cumulativeInterest: round2(cumulativeInterest),
      totalPaid,
      remainingBalance: round2(remainingBalance),
      monthInterest: round2(monthInterest),
      monthPrincipal: round2(monthPrincipal),
      monthlyPayment: round2(payment),
    });
  };

  push(0, 0, loanAmount, 0, 0, 0);

  if (schedule.length === 0) {
    const finalPropertyValue = round2(
      propertyValueAtMonth(price, years * 12, annualAppreciationPct),
    );
    const cashPaid = round2(downPayment);
    return {
      loanAmount: 0,
      monthlyPayment: 0,
      firstMonthInterest: 0,
      firstMonthPrincipal: 0,
      points,
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
    firstMonthInterest,
    firstMonthPrincipal,
    points,
    totalInterest: round2(cumulativeInterest),
    finalEquity: round2(last.equity),
    finalPropertyValue: last.propertyValue,
    totalCashPaid: last.totalPaid,
    cagr: mortgageEquityCagr(last.totalPaid, last.equity, years),
  };
}
