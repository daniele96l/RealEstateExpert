import {
  applyRentalModeToSimple,
  getDefaultSimpleScenario,
  sanitizeSimple,
  type SimpleScenario,
} from "./defaults";
import { estimateSqmFromPrice } from "./constants";
import { estimateRentableRooms } from "./rent-price-basis";
import type { ListingDetail, MapListing } from "./types";

export interface ListingAnalysisSource {
  sale: ListingDetail;
  similarRentals: MapListing[];
  avgRentPerRoom: number;
  avgWholeMonthly: number | null;
}

export function scenarioFromListingAnalysis(
  sale: ListingDetail,
  avgPerRoom: number,
  wholeMonthly: number | null,
): SimpleScenario {
  const base = getDefaultSimpleScenario();
  const price = sale.price > 0 ? sale.price : base.purchase_price;
  const mode = "medium_term_semester" as const;

  let scenario = applyRentalModeToSimple({ ...base, purchase_price: price }, mode);

  const sqm =
    sale.sqm != null && sale.sqm > 0 ? sale.sqm : estimateSqmFromPrice(price);
  const rentRooms = estimateRentableRooms(sale.rooms) ?? scenario.rent_rooms;

  const rentFields =
    wholeMonthly != null
      ? { monthly_rent: wholeMonthly, rent_price_basis: "whole" as const }
      : { monthly_rent: avgPerRoom, rent_price_basis: "per_room" as const };

  return sanitizeSimple({
    ...scenario,
    purchase_price: price,
    property_type: "investment",
    sqm,
    energy_class: sale.energy_class ?? scenario.energy_class,
    rent_rooms: rentRooms,
    ...rentFields,
    condominio_monthly:
      sale.condominio_monthly != null && sale.condominio_monthly > 0
        ? sale.condominio_monthly
        : scenario.condominio_monthly,
    renovation_cost: sale.needs_renovation === true ? 15_000 : scenario.renovation_cost,
  });
}
