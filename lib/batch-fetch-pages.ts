import { ITALY_DEFAULTS } from "./constants";
import { CZECH_DEFAULTS } from "./constants-cz";
import type { MarketId } from "./markets";

/** Fetch until the portal has no more pages (bounded by hard cap). */
export const BATCH_FETCH_ALL_PAGES = 0;

export function isBatchFetchAllPages(maxPages: number): boolean {
  return maxPages === BATCH_FETCH_ALL_PAGES;
}

export function batchFetchPageCap(market: MarketId): number {
  return market === "cz"
    ? CZECH_DEFAULTS.batch_fetch_max_pages_cap
    : ITALY_DEFAULTS.batch_fetch_max_pages_cap;
}

export function batchFetchPageDefault(market: MarketId): number {
  return market === "cz"
    ? CZECH_DEFAULTS.batch_fetch_max_pages
    : ITALY_DEFAULTS.batch_fetch_max_pages;
}

export function batchFetchAllPagesHardCap(market: MarketId): number {
  return market === "cz"
    ? CZECH_DEFAULTS.batch_fetch_all_pages_hard_cap
    : ITALY_DEFAULTS.batch_fetch_all_pages_hard_cap;
}

export function resolveBatchFetchPageLimit(
  maxPages: number | undefined,
  market: MarketId,
): number {
  if (maxPages === BATCH_FETCH_ALL_PAGES) {
    return batchFetchAllPagesHardCap(market);
  }
  const defaultVal = batchFetchPageDefault(market);
  const cap = batchFetchPageCap(market);
  return Math.min(Math.max(maxPages ?? defaultVal, 1), cap);
}

export function formatBatchFetchPagesLabel(maxPages: number, market: MarketId = "it"): string {
  if (isBatchFetchAllPages(maxPages)) {
    return market === "cz" ? "vše" : "tutte";
  }
  return `${maxPages} pag.`;
}

export function resolveItalyListingMaxPages(maxPages?: number): number {
  return resolveBatchFetchPageLimit(
    maxPages ?? BATCH_FETCH_ALL_PAGES,
    "it",
  );
}

export function batchFetchPagePresets(market: MarketId): number[] {
  const cap = batchFetchPageCap(market);
  const values = [1, 3, 5, cap].filter((n, i, arr) => n <= cap && arr.indexOf(n) === i);
  if (cap > 5 && !values.includes(Math.min(10, cap))) {
    values.splice(values.length - 1, 0, Math.min(10, cap));
  }
  return [...values, BATCH_FETCH_ALL_PAGES];
}
