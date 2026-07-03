import { estimateSqmFromPrice, listingRenovationCost } from "./constants";
import {
  applyRentalModeToSimple,
  getDefaultSimpleScenario,
  sanitizeSimple,
  toInvestmentScenario,
} from "./defaults";
import { runSimulation } from "./engine/simulator";
import { listingDistanceMeters } from "./geo-filter";
import {
  DEFAULT_LISTING_PROFIT_SETTINGS,
  type ListingProfitSettings,
  sanitizeListingProfitSettings,
} from "./listing-profit-settings";
import { similarRentEstimateSummary } from "./rent-price-basis";
import type { MapListing } from "./types";
import type { MarketId } from "./markets";

export interface ListingProfitPreview {
  neighborCount: number;
  avgRentPerSqm: number | null;
  avgRentPerRoom: number | null;
  estimatedMonthlyRent: number;
  year1NetProfit: number;
  monthlyNetProfit: number;
}

export function nearbyRentListings(
  sale: MapListing,
  rentPool: MapListing[],
  radiusM: number,
): MapListing[] {
  if (sale.lat === 0 && sale.lng === 0) return [];
  const center = { lat: sale.lat, lng: sale.lng };
  return rentPool.filter((rent) => {
    if (rent.operation !== "rent") return false;
    const dist = listingDistanceMeters(rent, center);
    return dist != null && dist <= radiusM;
  });
}

export function computeListingProfitPreview(
  sale: MapListing,
  rentPool: MapListing[],
  settings: ListingProfitSettings = DEFAULT_LISTING_PROFIT_SETTINGS,
  market: MarketId = "it",
): ListingProfitPreview | null {
  if (sale.operation !== "sale" || sale.price <= 0) return null;

  const opts = sanitizeListingProfitSettings(settings);
  const neighbors = nearbyRentListings(sale, rentPool, opts.radiusM);
  const rentSummary = similarRentEstimateSummary(sale, neighbors, opts.rentMethod);
  const estimatedMonthlyRent = rentSummary.avgWholeMonthly;
  if (estimatedMonthlyRent == null || estimatedMonthlyRent <= 0) return null;

  const sqm = sale.sqm != null && sale.sqm > 0 ? sale.sqm : estimateSqmFromPrice(sale.price);
  const base = getDefaultSimpleScenario(market);
  let scenario = applyRentalModeToSimple(
    {
      ...base,
      purchase_price: sale.price,
      property_type: "investment",
      sqm,
      down_payment_pct: opts.downPaymentPct,
      interest_rate_annual: opts.mortgageRatePct,
      loan_years: opts.loanYears,
      monthly_rent: estimatedMonthlyRent,
      rent_price_basis: "whole",
      rent_rooms: 1,
      renovation_cost:
        listingRenovationCost(sale.needs_renovation, sale.sqm, sale.price) ?? base.renovation_cost,
    },
    opts.rentalMode,
    market,
  );

  scenario = sanitizeSimple(scenario, market);
  const result = runSimulation(toInvestmentScenario(scenario, market), market);
  const year1NetProfit = result.summary.year_1_net_cash_flow;

  return {
    neighborCount: neighbors.length,
    avgRentPerSqm: rentSummary.avgRentPerSqm,
    avgRentPerRoom: rentSummary.avgRentPerRoom,
    estimatedMonthlyRent,
    year1NetProfit,
    monthlyNetProfit: Math.round(year1NetProfit / 12),
  };
}

export function computeListingProfitPreviews(
  sales: MapListing[],
  rentPool: MapListing[],
  settings: ListingProfitSettings = DEFAULT_LISTING_PROFIT_SETTINGS,
  market: MarketId = "it",
): Map<string, ListingProfitPreview> {
  const map = new Map<string, ListingProfitPreview>();
  for (const sale of sales) {
    const preview = computeListingProfitPreview(sale, rentPool, settings, market);
    if (preview) map.set(sale.id, preview);
  }
  return map;
}

export function profitSettingsSummary(
  settings: ListingProfitSettings,
  market: MarketId = "it",
): string {
  const s = sanitizeListingProfitSettings(settings);
  const rentLabel =
    s.rentMethod === "per_sqm"
      ? market === "cz"
        ? "Kč/m²"
        : "€/m²"
      : market === "cz"
        ? "Kč/pokoj"
        : "€/stanza";
  const radiusKm = s.radiusM >= 1000 ? `${s.radiusM / 1000} km` : `${s.radiusM} m`;
  const mortgage =
    market === "cz"
      ? `hypotéka ${s.loanYears} let ${s.mortgageRatePct}%`
      : `mutuo ${s.loanYears}y ${s.mortgageRatePct}%`;
  return `${rentLabel} · ${radiusKm} · ${mortgage}`;
}
