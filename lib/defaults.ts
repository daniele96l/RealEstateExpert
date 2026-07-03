import type { EnergyClass, InvestmentScenario, RentalMode } from "./types";
import type { MarketId } from "./markets";
import {
  ITALY_DEFAULTS,
  estimateFurnishing,
  estimateMonthlyRent,
  estimateNightlyRate,
  estimateUtilitiesAnnual,
} from "./constants";
import {
  CZECH_DEFAULTS,
  estimateCzechFurnishing,
  estimateCzechMonthlyRent,
  estimateCzechNightlyRate,
  estimateCzechPropertyTax,
  estimateCzechSemesterMonthlyRent,
  estimateCzechUtilitiesAnnual,
} from "./constants-cz";
import { getRentalModePreset } from "./rental-presets";
import {
  maintenancePctForRentalMode,
  sanitizeMaintenancePct,
} from "./maintenance-options";

export type RentPriceInputBasis = "per_room" | "whole";

export function computeProjectionYears(loanYears: number, market: MarketId = "it"): number {
  const after =
    market === "cz"
      ? CZECH_DEFAULTS.projection_years_after_mortgage
      : ITALY_DEFAULTS.projection_years_after_mortgage;
  return loanYears + after;
}

/** Campi essenziali mostrati nel form */
export interface SimpleScenario {
  purchase_price: number;
  property_type: "prima_casa" | "investment";
  cadastral_value: number | null;
  sqm: number;
  energy_class: EnergyClass;
  down_payment_pct: number;
  interest_rate_annual: number;
  loan_years: number;
  loan_amount: number | null;
  notary_pct: number;
  agency_pct: number;
  registration_tax_pct: number | null;
  renovation_cost: number;
  furnishing_cost: number;
  rental_mode: RentalMode;
  monthly_rent: number;
  rent_rooms: number;
  rent_price_basis: RentPriceInputBasis;
  nightly_rate: number;
  occupancy_pct: number;
  condominio_monthly: number;
  maintenance_pct: number;
  utilities_annual: number;
  utilities_auto: boolean;
  /** Czech: annual property tax (Kč) */
  property_tax_annual: number;
  /** Czech: flat rental income tax % */
  rental_income_tax_pct: number;
}

export function resolveScenarioMonthlyRent(
  s: Pick<SimpleScenario, "monthly_rent" | "rent_rooms" | "rent_price_basis" | "rental_mode">,
  market: MarketId = "it",
): number {
  if (s.rental_mode === "short_term_airbnb") return s.monthly_rent;
  if (s.rent_price_basis === "per_room") {
    const defaultRooms =
      market === "cz" ? CZECH_DEFAULTS.default_rent_rooms : ITALY_DEFAULTS.default_rent_rooms;
    const rooms = s.rent_rooms > 0 ? s.rent_rooms : defaultRooms;
    return s.monthly_rent * rooms;
  }
  return s.monthly_rent;
}

export function resolveUtilitiesAnnual(s: SimpleScenario, market: MarketId = "it"): number {
  if (s.utilities_auto) {
    if (market === "cz") {
      return estimateCzechUtilitiesAnnual(s.sqm, s.energy_class, s.rental_mode, s.occupancy_pct);
    }
    return estimateUtilitiesAnnual(s.sqm, s.energy_class, s.rental_mode, s.occupancy_pct);
  }
  return Math.max(0, s.utilities_annual);
}

function czPreset(mode: RentalMode, price: number) {
  const monthly =
    mode === "short_term_airbnb"
      ? estimateCzechMonthlyRent(price)
      : mode === "long_term"
        ? estimateCzechMonthlyRent(price)
        : estimateCzechSemesterMonthlyRent(price);
  return {
    monthly_rent: monthly,
    nightly_rate: estimateCzechNightlyRate(price),
    occupancy_pct: mode === "short_term_airbnb" ? 62 : mode === "medium_term_semester" ? 80 : 90,
    furnishing_cost: estimateCzechFurnishing(price, mode),
    condominio_monthly: Math.round(estimateCzechMonthlyRent(price) * 0.05),
  };
}

export function getDefaultSimpleScenario(market: MarketId = "it"): SimpleScenario {
  if (market === "cz") {
    const price = CZECH_DEFAULTS.default_purchase_price;
    const sqm = CZECH_DEFAULTS.default_sqm;
    const energy_class: EnergyClass = "D";
    const preset = czPreset("medium_term_semester", price);
    return {
      purchase_price: price,
      property_type: "investment",
      cadastral_value: null,
      sqm,
      energy_class,
      down_payment_pct: CZECH_DEFAULTS.investment_down_payment_pct,
      interest_rate_annual: CZECH_DEFAULTS.mortgage_rate_pct,
      loan_years: CZECH_DEFAULTS.default_loan_years,
      loan_amount: null,
      notary_pct: CZECH_DEFAULTS.notary_pct,
      agency_pct: CZECH_DEFAULTS.agency_pct,
      registration_tax_pct: CZECH_DEFAULTS.registration_tax_pct,
      renovation_cost: CZECH_DEFAULTS.default_renovation_cost,
      furnishing_cost: preset.furnishing_cost,
      rental_mode: "medium_term_semester",
      monthly_rent: preset.monthly_rent,
      rent_rooms: CZECH_DEFAULTS.default_rent_rooms,
      rent_price_basis: "whole",
      nightly_rate: preset.nightly_rate,
      occupancy_pct: preset.occupancy_pct,
      condominio_monthly: preset.condominio_monthly,
      maintenance_pct: maintenancePctForRentalMode("medium_term_semester", "cz"),
      utilities_annual: 0,
      utilities_auto: true,
      property_tax_annual: estimateCzechPropertyTax(price, sqm),
      rental_income_tax_pct: CZECH_DEFAULTS.rental_income_tax_pct,
    };
  }

  const price = ITALY_DEFAULTS.default_purchase_price;
  const sqm = ITALY_DEFAULTS.default_sqm;
  const energy_class: EnergyClass = "D";
  const preset = getRentalModePreset("medium_term_semester", price);
  return {
    purchase_price: price,
    property_type: "investment",
    cadastral_value: null,
    sqm,
    energy_class,
    down_payment_pct: ITALY_DEFAULTS.investment_down_payment_pct,
    interest_rate_annual: ITALY_DEFAULTS.mortgage_rate_pct,
    loan_years: ITALY_DEFAULTS.default_loan_years,
    loan_amount: null,
    notary_pct: ITALY_DEFAULTS.notary_pct,
    agency_pct: ITALY_DEFAULTS.agency_pct,
    registration_tax_pct: null,
    renovation_cost: ITALY_DEFAULTS.default_renovation_cost,
    furnishing_cost: preset.furnishing_cost,
    rental_mode: "medium_term_semester",
    monthly_rent: preset.monthly_rent,
    rent_rooms: ITALY_DEFAULTS.default_rent_rooms,
    rent_price_basis: "whole",
    nightly_rate: preset.nightly_rate,
    occupancy_pct: preset.occupancy_pct,
    condominio_monthly: preset.condominio_monthly,
    maintenance_pct: maintenancePctForRentalMode("medium_term_semester", "it"),
    utilities_annual: 0,
    utilities_auto: true,
    property_tax_annual: 0,
    rental_income_tax_pct: 0,
  };
}

export function toInvestmentScenario(s: SimpleScenario, market: MarketId = "it"): InvestmentScenario {
  if (market === "cz") {
    const preset = czPreset(s.rental_mode, s.purchase_price);
    const usesMonthlyRent = s.rental_mode !== "short_term_airbnb";
    return {
      property: {
        purchase_price: s.purchase_price,
        property_type: "investment",
        cadastral_value: null,
        notary_pct: s.notary_pct,
        agency_pct: s.agency_pct,
        registration_tax_pct: 0,
        vat_pct: 0,
      },
      financing: {
        down_payment_pct: s.down_payment_pct,
        loan_amount: s.loan_amount,
        interest_rate_annual: s.interest_rate_annual,
        loan_years: s.loan_years,
      },
      renovation: {
        renovation_level: s.renovation_cost > 0 ? "minor" : "none",
        renovation_cost: s.renovation_cost,
        furnishing_cost: s.furnishing_cost,
      },
      rental: {
        rental_mode: s.rental_mode,
        tenant_profile: "students_annual",
        monthly_rent: usesMonthlyRent ? resolveScenarioMonthlyRent(s, market) : null,
        nightly_rate: usesMonthlyRent ? null : s.nightly_rate,
        occupancy_rate: s.occupancy_pct / 100,
        avg_stay_nights: CZECH_DEFAULTS.avg_stay_nights,
        turnovers_per_year: 0,
      },
      operating: {
        imu_rate: 0,
        affitti_brevi_imu_surcharge: false,
        affitti_brevi_imu_surcharge_rate: 0,
        tari_annual: s.property_tax_annual,
        condominio_monthly: s.condominio_monthly,
        insurance_annual: Math.round(2500 + s.purchase_price * 0.001),
        maintenance_pct: s.maintenance_pct,
        agency_fee_months: 0,
        platform_fee_pct: s.rental_mode === "short_term_airbnb" ? CZECH_DEFAULTS.platform_fee_pct : 0,
        cleaning_fee_per_turnover: 0,
        utilities_landlord_annual: resolveUtilitiesAnnual(s, market),
      },
      tax: {
        tax_regime: "cedolare_secca",
        cedolare_rate: s.rental_income_tax_pct / 100,
        use_irpef: false,
      },
      projection_years: computeProjectionYears(s.loan_years, market),
      price_appreciation_annual: 0,
    };
  }

  const preset = getRentalModePreset(s.rental_mode, s.purchase_price);
  const usesMonthlyRent = s.rental_mode !== "short_term_airbnb";

  return {
    property: {
      purchase_price: s.purchase_price,
      property_type: s.property_type,
      cadastral_value: s.cadastral_value,
      notary_pct: s.notary_pct,
      agency_pct: s.agency_pct,
      registration_tax_pct: s.registration_tax_pct,
      vat_pct: 0,
    },
    financing: {
      down_payment_pct: s.down_payment_pct,
      loan_amount: s.loan_amount,
      interest_rate_annual: s.interest_rate_annual,
      loan_years: s.loan_years,
    },
    renovation: {
      renovation_level: s.renovation_cost > 0 ? "minor" : "none",
      renovation_cost: s.renovation_cost,
      furnishing_cost: s.furnishing_cost,
    },
    rental: {
      rental_mode: s.rental_mode,
      tenant_profile:
        s.rental_mode === "medium_term_semester" ? "students_annual" : "workers_annual",
      monthly_rent: usesMonthlyRent ? resolveScenarioMonthlyRent(s, market) : null,
      nightly_rate: usesMonthlyRent ? null : s.nightly_rate,
      occupancy_rate: s.occupancy_pct / 100,
      avg_stay_nights: preset.rental.avg_stay_nights,
      turnovers_per_year: preset.rental.turnovers_per_year,
    },
    operating: {
      imu_rate: ITALY_DEFAULTS.imu_rate,
      affitti_brevi_imu_surcharge: preset.operating.affitti_brevi_imu_surcharge,
      affitti_brevi_imu_surcharge_rate: preset.operating.affitti_brevi_imu_surcharge_rate,
      tari_annual: preset.operating.tari_annual,
      condominio_monthly: s.condominio_monthly,
      insurance_annual: preset.operating.insurance_annual,
      maintenance_pct: s.maintenance_pct,
      agency_fee_months: preset.operating.agency_fee_months,
      platform_fee_pct: preset.operating.platform_fee_pct,
      cleaning_fee_per_turnover: preset.operating.cleaning_fee_per_turnover,
      utilities_landlord_annual: resolveUtilitiesAnnual(s, market),
    },
    tax: {
      tax_regime: "cedolare_secca",
      cedolare_rate: preset.cedolare_rate,
      use_irpef: false,
    },
    projection_years: computeProjectionYears(s.loan_years, market),
    price_appreciation_annual: 0,
  };
}

/** Applica i default del regime selezionato (chiamato al cambio modalità affitto) */
export function applyRentalModeToSimple(
  s: SimpleScenario,
  mode: RentalMode,
  market: MarketId = "it",
): SimpleScenario {
  const price =
    s.purchase_price > 0
      ? s.purchase_price
      : market === "cz"
        ? CZECH_DEFAULTS.default_purchase_price
        : ITALY_DEFAULTS.default_purchase_price;

  if (market === "cz") {
    const preset = czPreset(mode, price);
    const next = {
      ...s,
      rental_mode: mode,
      occupancy_pct: preset.occupancy_pct,
      monthly_rent: preset.monthly_rent,
      nightly_rate: preset.nightly_rate,
      furnishing_cost: preset.furnishing_cost,
      condominio_monthly: preset.condominio_monthly,
      maintenance_pct: maintenancePctForRentalMode(mode, market),
    };
    if (next.utilities_auto) {
      next.utilities_annual = estimateCzechUtilitiesAnnual(
        next.sqm,
        next.energy_class,
        mode,
        next.occupancy_pct,
      );
    }
    return next;
  }

  const preset = getRentalModePreset(mode, price);
  const next = {
    ...s,
    rental_mode: mode,
    occupancy_pct: preset.occupancy_pct,
    monthly_rent: preset.monthly_rent,
    nightly_rate: preset.nightly_rate,
    furnishing_cost: preset.furnishing_cost,
    condominio_monthly: preset.condominio_monthly,
    maintenance_pct: maintenancePctForRentalMode(mode, market),
  };
  if (next.utilities_auto) {
    next.utilities_annual = estimateUtilitiesAnnual(
      next.sqm,
      next.energy_class,
      mode,
      next.occupancy_pct,
    );
  }
  return next;
}

export function sanitizeSimple(s: SimpleScenario, market: MarketId = "it"): SimpleScenario {
  const defaults = market === "cz" ? CZECH_DEFAULTS : ITALY_DEFAULTS;
  const price = s.purchase_price > 0 ? s.purchase_price : defaults.default_purchase_price;
  const preset =
    market === "cz" ? czPreset(s.rental_mode, price) : getRentalModePreset(s.rental_mode, price);
  const sqm = s.sqm > 0 ? s.sqm : defaults.default_sqm;

  const base = {
    ...s,
    purchase_price: price,
    sqm,
    cadastral_value:
      market === "cz"
        ? null
        : s.cadastral_value != null && !Number.isNaN(s.cadastral_value) && s.cadastral_value > 0
          ? s.cadastral_value
          : null,
    down_payment_pct:
      Number.isFinite(s.down_payment_pct) && s.down_payment_pct >= 0 && s.down_payment_pct <= 100
        ? s.down_payment_pct
        : defaults.investment_down_payment_pct,
    interest_rate_annual:
      Number.isFinite(s.interest_rate_annual) && s.interest_rate_annual >= 0
        ? s.interest_rate_annual
        : defaults.mortgage_rate_pct,
    loan_years:
      Number.isFinite(s.loan_years) && s.loan_years >= 1 && s.loan_years <= 40
        ? Math.round(s.loan_years)
        : defaults.default_loan_years,
    loan_amount:
      s.loan_amount != null && Number.isFinite(s.loan_amount) && s.loan_amount >= 0
        ? s.loan_amount
        : null,
    notary_pct:
      Number.isFinite(s.notary_pct) && s.notary_pct >= 0
        ? s.notary_pct
        : market === "cz"
          ? CZECH_DEFAULTS.notary_pct
          : ITALY_DEFAULTS.notary_pct,
    agency_pct:
      Number.isFinite(s.agency_pct) && s.agency_pct >= 0
        ? s.agency_pct
        : market === "cz"
          ? CZECH_DEFAULTS.agency_pct
          : ITALY_DEFAULTS.agency_pct,
    registration_tax_pct:
      market === "cz"
        ? CZECH_DEFAULTS.registration_tax_pct
        : s.registration_tax_pct != null &&
            Number.isFinite(s.registration_tax_pct) &&
            s.registration_tax_pct >= 0
          ? s.registration_tax_pct
          : null,
    renovation_cost:
      s.renovation_cost >= 0 && Number.isFinite(s.renovation_cost)
        ? s.renovation_cost
        : defaults.default_renovation_cost,
    occupancy_pct: Math.min(100, Math.max(0, s.occupancy_pct || preset.occupancy_pct)),
    monthly_rent: s.monthly_rent > 0 ? s.monthly_rent : preset.monthly_rent,
    rent_rooms:
      s.rent_rooms > 0 && Number.isFinite(s.rent_rooms)
        ? Math.round(s.rent_rooms)
        : defaults.default_rent_rooms,
    rent_price_basis: (s.rent_price_basis === "per_room" ? "per_room" : "whole") as RentPriceInputBasis,
    nightly_rate: s.nightly_rate > 0 ? s.nightly_rate : preset.nightly_rate,
    condominio_monthly:
      s.condominio_monthly > 0 ? s.condominio_monthly : preset.condominio_monthly,
    maintenance_pct: sanitizeMaintenancePct(s.maintenance_pct, s.rental_mode, market),
    property_tax_annual:
      market === "cz"
        ? s.property_tax_annual > 0
          ? s.property_tax_annual
          : estimateCzechPropertyTax(price, sqm)
        : 0,
    rental_income_tax_pct:
      market === "cz"
        ? Number.isFinite(s.rental_income_tax_pct) && s.rental_income_tax_pct > 0
          ? s.rental_income_tax_pct
          : CZECH_DEFAULTS.rental_income_tax_pct
        : 0,
  };

  if (base.utilities_auto) {
    base.utilities_annual =
      market === "cz"
        ? estimateCzechUtilitiesAnnual(base.sqm, base.energy_class, base.rental_mode, base.occupancy_pct)
        : estimateUtilitiesAnnual(base.sqm, base.energy_class, base.rental_mode, base.occupancy_pct);
  }

  return base;
}

export type PurchaseCostField =
  | "down_payment"
  | "registration_tax"
  | "notary"
  | "agency"
  | "renovation"
  | "furnishing"
  | "loan_amount";

function effectiveCadastralFromSimple(s: SimpleScenario): number {
  const price = s.purchase_price > 0 ? s.purchase_price : ITALY_DEFAULTS.default_purchase_price;
  return s.cadastral_value != null && s.cadastral_value > 0
    ? s.cadastral_value
    : price * ITALY_DEFAULTS.cadastral_ratio;
}

function financedProjectTotalFromSimple(s: SimpleScenario): number {
  const price = s.purchase_price > 0 ? s.purchase_price : ITALY_DEFAULTS.default_purchase_price;
  return price + Math.max(0, s.renovation_cost) + Math.max(0, s.furnishing_cost);
}

export function applyPurchaseCostEdit(
  s: SimpleScenario,
  field: PurchaseCostField,
  valueEuro: number,
): SimpleScenario {
  const price = s.purchase_price > 0 ? s.purchase_price : ITALY_DEFAULTS.default_purchase_price;
  const projectTotal = financedProjectTotalFromSimple(s);
  const v = Math.max(0, valueEuro);

  switch (field) {
    case "down_payment":
      return {
        ...s,
        down_payment_pct: projectTotal > 0 ? (v / projectTotal) * 100 : s.down_payment_pct,
        loan_amount: null,
      };
    case "registration_tax": {
      const cadastral = effectiveCadastralFromSimple(s);
      return {
        ...s,
        registration_tax_pct: cadastral > 0 ? (v / cadastral) * 100 : s.registration_tax_pct,
      };
    }
    case "notary":
      return { ...s, notary_pct: price > 0 ? (v / price) * 100 : s.notary_pct };
    case "agency":
      return { ...s, agency_pct: price > 0 ? (v / price) * 100 : s.agency_pct };
    case "renovation":
      return { ...s, renovation_cost: v, loan_amount: null };
    case "furnishing":
      return { ...s, furnishing_cost: v, loan_amount: null };
    case "loan_amount":
      return {
        ...s,
        loan_amount: v,
        down_payment_pct:
          projectTotal > 0
            ? Math.max(0, Math.min(100, ((projectTotal - v) / projectTotal) * 100))
            : s.down_payment_pct,
      };
  }
}
