import { frenchAmortizationSchedule, monthlyMortgagePayment } from "./mortgage";
import { round2 } from "./helpers";

export interface MortgageSimPoint {
  month: number;
  year: number;
  equity: number;
  cumulativeInterest: number;
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
  /** CAGR as fraction (e.g. 0.052 = 5.2%), or null if undefined. */
  cagr: number | null;
}

export function mortgageEquityCagr(
  initialInvestment: number,
  finalEquity: number,
  years: number,
): number | null {
  if (initialInvestment <= 0 || years <= 0 || finalEquity <= 0) return null;
  return Math.pow(finalEquity / initialInvestment, 1 / years) - 1;
}

export function buildMortgageSimSeries(params: {
  price: number;
  downPayment: number;
  annualRate: number;
  years: number;
}): MortgageSimResult {
  const price = Math.max(0, params.price);
  const downPayment = Math.min(Math.max(0, params.downPayment), price);
  const years = Math.max(0, Math.floor(params.years));
  const annualRate = Math.max(0, params.annualRate);
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
    const equity = round2(downPayment + cumulativePrincipal);
    points.push({
      month,
      year,
      equity,
      cumulativeInterest: round2(cumulativeInterest),
      totalPaid: round2(equity + cumulativeInterest),
      remainingBalance: round2(remainingBalance),
      monthInterest: round2(monthInterest),
      monthPrincipal: round2(monthPrincipal),
      monthlyPayment: round2(payment),
    });
  };

  push(0, 0, loanAmount, 0, 0, 0);

  if (schedule.length === 0) {
    return {
      loanAmount: 0,
      monthlyPayment: 0,
      firstMonthInterest: 0,
      firstMonthPrincipal: 0,
      points,
      totalInterest: 0,
      finalEquity: round2(downPayment),
      cagr: mortgageEquityCagr(downPayment, downPayment, Math.max(years, 1)),
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
  const finalEquity = last.equity;
  return {
    loanAmount,
    monthlyPayment: round2(monthlyPayment),
    firstMonthInterest,
    firstMonthPrincipal,
    points,
    totalInterest: round2(cumulativeInterest),
    finalEquity: round2(finalEquity),
    cagr: mortgageEquityCagr(downPayment, finalEquity, years),
  };
}
