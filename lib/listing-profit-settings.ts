import type { RentalMode } from "./types";
import type { SimilarRentEstimateMethod } from "./rent-price-basis";

export interface ListingProfitSettings {
  mortgageRatePct: number;
  loanYears: number;
  downPaymentPct: number;
  rentMethod: SimilarRentEstimateMethod;
  radiusM: number;
  rentalMode: RentalMode;
}

export const DEFAULT_LISTING_PROFIT_SETTINGS: ListingProfitSettings = {
  mortgageRatePct: 4,
  loanYears: 30,
  downPaymentPct: 25,
  rentMethod: "per_sqm",
  radiusM: 1_000,
  rentalMode: "long_term",
};

const STORAGE_KEY = "listing-profit-settings";

export function loadListingProfitSettings(): ListingProfitSettings {
  if (typeof window === "undefined") return DEFAULT_LISTING_PROFIT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LISTING_PROFIT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ListingProfitSettings>;
    return sanitizeListingProfitSettings({ ...DEFAULT_LISTING_PROFIT_SETTINGS, ...parsed });
  } catch {
    return DEFAULT_LISTING_PROFIT_SETTINGS;
  }
}

export function saveListingProfitSettings(settings: ListingProfitSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function sanitizeListingProfitSettings(s: ListingProfitSettings): ListingProfitSettings {
  return {
    mortgageRatePct:
      Number.isFinite(s.mortgageRatePct) && s.mortgageRatePct >= 0 && s.mortgageRatePct <= 20
        ? s.mortgageRatePct
        : DEFAULT_LISTING_PROFIT_SETTINGS.mortgageRatePct,
    loanYears:
      Number.isFinite(s.loanYears) && s.loanYears >= 1 && s.loanYears <= 40
        ? Math.round(s.loanYears)
        : DEFAULT_LISTING_PROFIT_SETTINGS.loanYears,
    downPaymentPct:
      Number.isFinite(s.downPaymentPct) && s.downPaymentPct >= 0 && s.downPaymentPct <= 100
        ? s.downPaymentPct
        : DEFAULT_LISTING_PROFIT_SETTINGS.downPaymentPct,
    rentMethod: s.rentMethod === "per_room" ? "per_room" : "per_sqm",
    radiusM:
      Number.isFinite(s.radiusM) && s.radiusM >= 200 && s.radiusM <= 20_000
        ? Math.round(s.radiusM)
        : DEFAULT_LISTING_PROFIT_SETTINGS.radiusM,
    rentalMode:
      s.rentalMode === "medium_term_semester" || s.rentalMode === "short_term_airbnb"
        ? s.rentalMode
        : "long_term",
  };
}

export const PROFIT_RADIUS_OPTIONS = [
  { value: 500, label: "0,5 km" },
  { value: 1_000, label: "1 km" },
  { value: 2_000, label: "2 km" },
  { value: 3_000, label: "3 km" },
  { value: 5_000, label: "5 km" },
] as const;
