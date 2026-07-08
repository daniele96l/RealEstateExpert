import type { PriceHistoryPoint } from "./types";

/** Annualized CAGR (%) from first to last sale price point. */
export function historicalSaleCagr(points: PriceHistoryPoint[]): number | null {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  if (first.price_sqm_avg <= 0 || last.price_sqm_avg <= 0) return null;

  const monthsSpan = (last.year - first.year) * 12 + (last.month - first.month);
  const years = monthsSpan / 12;
  if (years <= 0) return null;

  const growthFactor = last.price_sqm_avg / first.price_sqm_avg;
  if (!Number.isFinite(growthFactor) || growthFactor <= 0) return null;

  return (Math.pow(growthFactor, 1 / years) - 1) * 100;
}

/** Annualized CAGR (%) from first to last price point (sale or rent series). */
export function historicalPriceCagr(points: PriceHistoryPoint[]): number | null {
  return historicalSaleCagr(points);
}

export function propertyValueAtMonth(
  purchasePrice: number,
  month: number,
  annualAppreciationPct: number,
): number {
  if (purchasePrice <= 0 || month <= 0 || annualAppreciationPct === 0) {
    return purchasePrice;
  }
  const rate = annualAppreciationPct / 100;
  return purchasePrice * Math.pow(1 + rate, month / 12);
}

export function rentMultiplierAtMonth(month: number, annualAppreciationPct: number): number {
  if (month <= 0 || annualAppreciationPct === 0) return 1;
  return Math.pow(1 + annualAppreciationPct / 100, month / 12);
}
