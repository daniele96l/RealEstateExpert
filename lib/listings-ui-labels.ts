import type { TFunction } from "@/lib/i18n/context";
import type { MarketId } from "./markets";

export interface ListingsUiLabels {
  mapTitle: string;
  searchCity: string;
  sale: string;
  rent: string;
  both: string;
  perMonth: string;
  perYear: string;
  perSqm: string;
  perRoom: string;
  rooms: (count: number) => string;
  netProfit: string;
  estNetProfit: string;
  estRent: string;
  rentsInArea: (count: number) => string;
  condition: string;
  inView: (visible: number, total: number) => string;
  profitFilters: (filtered: number, total: number) => string;
  noListings: string;
  noListingsInArea: string;
  loadCityHint: string;
  listingPrice: string;
  renovationEstimate: string;
  pricePlusRenovation: string;
}

export function listingsUiLabels(market: MarketId, t: TFunction): ListingsUiLabels {
  return {
    mapTitle: market === "cz" ? t("listings.mapCz") : t("listings.mapIt"),
    searchCity: t("listings.searchCity"),
    sale: t("listings.sale"),
    rent: t("listings.rent"),
    both: t("listings.both"),
    perMonth: t("listings.perMonth"),
    perYear: t("listings.perYear"),
    perSqm: t("listings.perSqm"),
    perRoom: t("listings.perRoom"),
    rooms: (n) => t("listings.rooms", { count: n }),
    netProfit: t("listings.netProfit"),
    estNetProfit: t("listings.estNetProfit"),
    estRent: t("listings.estRent"),
    rentsInArea: (n) => t("listings.rentsInArea", { count: n }),
    condition: t("listings.condition"),
    inView: (visible, total) => t("listings.inView", { visible, total }),
    profitFilters: (filtered, total) => t("listings.profitFilters", { filtered, total }),
    noListings: t("listings.noListings"),
    noListingsInArea: t("listings.noListingsInArea"),
    loadCityHint: t("listings.loadCityHint"),
    listingPrice: t("listings.listingPrice"),
    renovationEstimate: t("listings.renovationEstimate"),
    pricePlusRenovation: t("listings.pricePlusRenovation"),
  };
}

export function conditionLabelForMarket(label: string | null, _market: MarketId): string | null {
  return label;
}
