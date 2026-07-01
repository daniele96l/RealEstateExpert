import { round2 } from "./helpers";

export interface MortgagePayment {
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export function frenchAmortizationSchedule(
  loanAmount: number,
  annualRate: number,
  years: number,
): MortgagePayment[] {
  if (loanAmount <= 0) return [];

  const monthlyRate = annualRate / 100 / 12;
  const nPayments = years * 12;

  if (monthlyRate === 0) {
    const payment = loanAmount / nPayments;
    const schedule: MortgagePayment[] = [];
    let balance = loanAmount;
    for (let i = 0; i < nPayments; i++) {
      balance -= payment;
      schedule.push({
        payment: round2(payment),
        interest: 0,
        principal: round2(payment),
        balance: round2(Math.max(0, balance)),
      });
    }
    return schedule;
  }

  const payment =
    (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, nPayments))) /
    (Math.pow(1 + monthlyRate, nPayments) - 1);

  const schedule: MortgagePayment[] = [];
  let balance = loanAmount;
  for (let i = 0; i < nPayments; i++) {
    const interest = balance * monthlyRate;
    const principal = payment - interest;
    balance -= principal;
    schedule.push({
      payment: round2(payment),
      interest: round2(interest),
      principal: round2(principal),
      balance: round2(Math.max(0, balance)),
    });
  }
  return schedule;
}

export function monthlyMortgagePayment(
  loanAmount: number,
  annualRate: number,
  years: number,
): number {
  const schedule = frenchAmortizationSchedule(loanAmount, annualRate, years);
  return schedule[0]?.payment ?? 0;
}
