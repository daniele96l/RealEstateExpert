export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

import type { MarketId } from "./markets";
import { getMarket } from "./markets";

export function fmtEuro(n: number) {
  return fmtMoney(n, "it");
}

export function fmtMoney(n: number, market: MarketId = "it") {
  const cfg = getMarket(market);
  return new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency: cfg.currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtPct(n: number, digits = 1) {
  return `${n.toFixed(digits)}%`;
}
