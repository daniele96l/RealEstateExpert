import type { ListingProfitPreview } from "./listing-profit-preview";
import type { MapListing } from "./types";

export type ListingProfitSort = "default" | "profit_desc" | "profit_asc" | "price_asc" | "price_desc";

export interface ListingProfitFilters {
  monthlyMin: number | null;
  monthlyMax: number | null;
  onlyPositive: boolean;
  hideWithoutEstimate: boolean;
  sortBy: ListingProfitSort;
}

export const EMPTY_LISTING_PROFIT_FILTERS: ListingProfitFilters = {
  monthlyMin: null,
  monthlyMax: null,
  onlyPositive: false,
  hideWithoutEstimate: false,
  sortBy: "profit_desc",
};

const STORAGE_KEY = "listing-profit-filters";

export function loadListingProfitFilters(): ListingProfitFilters {
  if (typeof window === "undefined") return EMPTY_LISTING_PROFIT_FILTERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LISTING_PROFIT_FILTERS;
    return sanitizeListingProfitFilters({
      ...EMPTY_LISTING_PROFIT_FILTERS,
      ...JSON.parse(raw),
    });
  } catch {
    return EMPTY_LISTING_PROFIT_FILTERS;
  }
}

export function saveListingProfitFilters(filters: ListingProfitFilters): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

export function sanitizeListingProfitFilters(f: ListingProfitFilters): ListingProfitFilters {
  const sort: ListingProfitSort[] = [
    "default",
    "profit_desc",
    "profit_asc",
    "price_asc",
    "price_desc",
  ];
  return {
    monthlyMin:
      f.monthlyMin != null && Number.isFinite(f.monthlyMin) ? Math.round(f.monthlyMin) : null,
    monthlyMax:
      f.monthlyMax != null && Number.isFinite(f.monthlyMax) ? Math.round(f.monthlyMax) : null,
    onlyPositive: Boolean(f.onlyPositive),
    hideWithoutEstimate: Boolean(f.hideWithoutEstimate),
    sortBy: sort.includes(f.sortBy) ? f.sortBy : EMPTY_LISTING_PROFIT_FILTERS.sortBy,
  };
}

export function hasActiveListingProfitFilters(f: ListingProfitFilters): boolean {
  return (
    f.monthlyMin != null ||
    f.monthlyMax != null ||
    f.onlyPositive ||
    f.hideWithoutEstimate
  );
}

function profitValue(
  listing: MapListing,
  previews: Map<string, ListingProfitPreview>,
): number | null {
  if (listing.operation !== "sale") return null;
  return previews.get(listing.id)?.monthlyNetProfit ?? null;
}

export function applyListingProfitFilters(
  listings: MapListing[],
  previews: Map<string, ListingProfitPreview>,
  filters: ListingProfitFilters,
): MapListing[] {
  const f = sanitizeListingProfitFilters(filters);
  let result = listings.filter((listing) => {
    if (listing.operation !== "sale") return true;
    const profit = previews.get(listing.id);
    if (!profit) return !f.hideWithoutEstimate;
    if (f.onlyPositive && profit.monthlyNetProfit <= 0) return false;
    if (f.monthlyMin != null && profit.monthlyNetProfit < f.monthlyMin) return false;
    if (f.monthlyMax != null && profit.monthlyNetProfit > f.monthlyMax) return false;
    return true;
  });

  if (f.sortBy === "default") return result;

  result = [...result].sort((a, b) => {
    if (f.sortBy === "price_asc" || f.sortBy === "price_desc") {
      const diff = a.price - b.price;
      return f.sortBy === "price_asc" ? diff : -diff;
    }
    const pa = profitValue(a, previews);
    const pb = profitValue(b, previews);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return f.sortBy === "profit_asc" ? pa - pb : pb - pa;
  });

  return result;
}
