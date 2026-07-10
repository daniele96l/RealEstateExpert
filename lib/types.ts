import type { OccupancyPortal } from "@/lib/occupancy/portals";

export type PropertyType = "prima_casa" | "seconda_casa" | "investment";
export type EnergyClass = "A4" | "A3" | "A2" | "A1" | "B" | "C" | "D" | "E" | "F" | "G";
export type RenovationLevel = "none" | "minor" | "full" | "reconstruction";
export type RentalMode = "long_term" | "medium_term_semester" | "short_term_airbnb";
export type TenantProfile = "workers_annual" | "students_annual" | "workers_monthly" | "mixed";
export type TaxRegime = "cedolare_secca" | "irpef";

export interface InvestmentScenario {
  property: {
    purchase_price: number;
    property_type: PropertyType;
    cadastral_value: number | null;
    notary_pct: number;
    agency_pct: number;
    registration_tax_pct: number | null;
    vat_pct: number;
  };
  financing: {
    down_payment_pct: number;
    loan_amount: number | null;
    interest_rate_annual: number;
    loan_years: number;
  };
  renovation: {
    renovation_level: RenovationLevel;
    renovation_cost: number;
    furnishing_cost: number;
  };
  rental: {
    rental_mode: RentalMode;
    tenant_profile: TenantProfile;
    monthly_rent: number | null;
    nightly_rate: number | null;
    occupancy_rate: number | null;
    avg_stay_nights: number;
    turnovers_per_year: number;
  };
  operating: {
    imu_rate: number;
    affitti_brevi_imu_surcharge: boolean;
    affitti_brevi_imu_surcharge_rate: number;
    tari_annual: number;
    condominio_monthly: number;
    insurance_annual: number;
    maintenance_pct: number | null;
    agency_fee_months: number;
    property_manager_fee_pct: number;
    platform_fee_pct: number;
    cleaning_fee_per_turnover: number;
    utilities_landlord_annual: number;
  };
  tax: {
    tax_regime: TaxRegime;
    cedolare_rate: number | null;
    use_irpef: boolean;
  };
  projection_years: number;
  price_appreciation_annual: number;
}

export interface MonthlyCashFlowPoint {
  month: number;
  year: number;
  gross_rent: number;
  platform_fee: number;
  cleaning_fee: number;
  agency_fee: number;
  imu: number;
  tari: number;
  condominio: number;
  insurance: number;
  maintenance: number;
  utilities: number;
  rental_tax: number;
  mortgage_payment: number;
  mortgage_interest: number;
  mortgage_principal: number;
  net_cash_flow: number;
  cumulative_cash_flow: number;
  mortgage_balance: number;
  property_value: number;
}

export interface AnnualSummary {
  year: number;
  gross_rent: number;
  total_opex: number;
  rental_tax: number;
  mortgage_payment: number;
  mortgage_interest: number;
  mortgage_principal: number;
  net_cash_flow: number;
  cumulative_cash_flow: number;
  mortgage_balance: number;
  property_value: number;
  equity: number;
}

export interface PurchaseCostBreakdown {
  down_payment: number;
  registration_tax: number;
  vat: number;
  notary: number;
  agency: number;
  renovation: number;
  furnishing: number;
  total_initial_cash: number;
  loan_amount: number;
}

export interface AnalysisResult {
  summary: {
    initial_cash_required: number;
    loan_amount: number;
    monthly_mortgage_payment: number;
    break_even_month: number | null;
    year_1_net_cash_flow: number;
    year_5_net_cash_flow: number;
    total_roi_pct: number;
    cash_on_cash_return_pct: number;
    net_yield_pct: number;
    purchase_costs: PurchaseCostBreakdown;
  };
  monthly_series: MonthlyCashFlowPoint[];
  annual_series: AnnualSummary[];
}

export interface ListingMetadata {
  title: string | null;
  address: string | null;
  city: string | null;
  sqm: number | null;
  rooms: number | null;
  operation: "sale" | "rent";
  source_url: string;
}

export interface IdealistaImportResult {
  scenario: InvestmentScenario;
  metadata: ListingMetadata;
  filled_fields: string[];
  unfilled_fields: string[];
  warnings: string[];
}

export interface MapListing {
  id: string;
  title: string;
  price: number;
  operation: "sale" | "rent";
  url: string;
  lat: number;
  lng: number;
  sqm: number | null;
  rooms: number | null;
  address: string | null;
  property_type: string | null;
  property_type_label: string | null;
  condition_status: string | null;
  condition: string | null;
  needs_renovation: boolean | null;
}

export interface ListingDetail extends MapListing {
  bathrooms: number | null;
  floor: string | null;
  energy_class: EnergyClass | null;
  energy_kwh_sqm: number | null;
  condition: string | null;
  needs_renovation: boolean | null;
  zone: string | null;
  city_label: string | null;
  price_per_sqm: number | null;
  condominio_monthly: number | null;
  lift: boolean | null;
  garden: boolean | null;
  terrace: boolean | null;
  garage: boolean | null;
  furnished: string | null;
  built_year: number | null;
  description: string | null;
  images: string[];
  fetched_at: string;
}

export interface MapCenter {
  lat: number;
  lng: number;
  display_name: string | null;
}

export type ListingsProvider =
  | "scrapingbee"
  | "rapidapi"
  | "realtyapi"
  | "direct"
  | "sreality"
  | "reggio_rentals";

export type MarketProvider = "scrapingbee" | "insights" | "sreality";

export interface PriceHistoryPoint {
  year: number;
  month: number;
  label: string;
  price_sqm_avg: number;
}

export interface MarketPriceHistory {
  city: string;
  region: string;
  region_slug: string;
  city_slug: string;
  mercato_url: string;
  sale: PriceHistoryPoint[];
  rent: PriceHistoryPoint[];
  provider: MarketProvider;
  fetched_at: string;
}

export interface CityListingsCache {
  city: string;
  operation: "sale" | "rent";
  fetched_at: string;
  center: MapCenter;
  listings: MapListing[];
  provider?: ListingsProvider;
}

export interface BatchPreviewResult {
  city: string;
  center: MapCenter;
  provider: ListingsProvider;
  fetched_at: string;
  sale?: CityListingsCache;
  rent?: CityListingsCache;
}

export interface BatchSaveResult {
  city: string;
  center: MapCenter;
  provider: ListingsProvider;
  fetched_at: string;
  sale?: CityListingsCache;
  rent?: CityListingsCache;
  listings: MapListing[];
}

export interface CombinedListingsData {
  center: MapCenter;
  listings: MapListing[];
  provider?: ListingsProvider;
  fetched_at?: string;
  areaRadiusM?: number | null;
  sale?: CityListingsCache;
  rent?: CityListingsCache;
}

export interface OccupancyBasicListing {
  id: string;
  price: number;
  lat: number;
  lng: number;
  sqm: number | null;
  rooms: number | null;
  address: string | null;
  zone: string | null;
}

export interface OccupancyPricePoint {
  at: string;
  price: number;
}

export interface TrackedRentalListing extends OccupancyBasicListing {
  first_seen_at: string;
  last_seen_at: string;
  rented_at: string | null;
  status: "active" | "presumed_rented";
  days_on_market: number | null;
  price_history: OccupancyPricePoint[];
}


export interface OccupancyRegistry {
  city: string;
  market: "it" | "cz";
  portal: OccupancyPortal;
  updated_at: string;
  snapshot_count: number;
  last_provider: ListingsProvider | null;
  listings: Record<string, TrackedRentalListing>;
}

export interface OccupancySnapshot {
  fetched_at: string;
  active_count: number;
  listings: OccupancyBasicListing[];
}

export interface OccupancyAreaMetrics {
  zone: string;
  active_count: number;
  rented_in_window: number;
  avg_price: number | null;
  avg_price_per_sqm: number | null;
  avg_days_on_market: number | null;
  median_days_on_market: number | null;
  turnover_30d: number | null;
  turnover_rented_30d: number;
  turnover_inventory_basis: number | null;
  estimated_occupancy_pct: number | null;
}

export interface OccupancyCityMetrics {
  city: string;
  market: "it" | "cz";
  portal: OccupancyPortal;
  updated_at: string | null;
  snapshot_count: number;
  last_provider: ListingsProvider | null;
  active_count: number;
  rented_in_window: number;
  avg_days_on_market: number | null;
  median_days_on_market: number | null;
  turnover_30d: number | null;
  turnover_rented_30d: number;
  turnover_inventory_basis: number | null;
  estimated_occupancy_pct: number | null;
  occupancy_window_days: number;
  areas: OccupancyAreaMetrics[];
}

export interface OccupancyAreaPreview {
  zone: string;
  count: number;
  avg_price: number | null;
  avg_price_per_sqm: number | null;
}

export interface OccupancySnapshotSummary {
  fetched_at: string;
  active_count: number;
}

export type OccupancyListingChangeStatus = "still_active" | "new" | "removed";

export interface OccupancySnapshotListing extends OccupancyBasicListing {
  change_status: OccupancyListingChangeStatus;
}

export interface OccupancySnapshotDiff {
  current_fetched_at: string;
  previous_fetched_at: string;
  still_active_count: number;
  new_count: number;
  removed_count: number;
  listings: OccupancySnapshotListing[];
}

/** Logged when a listing disappears from the portal (presumed rented). */
export interface OccupancyRemovalEvent {
  id: string;
  portal: OccupancyPortal;
  detected_at: string;
  presumed_rented_at: string;
  first_seen_at: string;
  last_seen_at: string;
  days_on_market: number | null;
  price: number;
  sqm: number | null;
  rooms: number | null;
  address: string | null;
  zone: string | null;
  lat: number;
  lng: number;
  price_history: OccupancyPricePoint[];
}

export interface OccupancyMapListing {
  id: string;
  lat: number;
  lng: number;
  zone: string | null;
  price: number;
  sqm: number | null;
  address: string | null;
  change_status?: OccupancyListingChangeStatus;
}

export interface OccupancyListingsPreview {
  source: "listings_cache" | "occupancy_snapshot";
  fetched_at: string;
  provider: string | null;
  listing_count: number;
  avg_price: number | null;
  median_price: number | null;
  avg_sqm: number | null;
  avg_price_per_sqm: number | null;
  median_price_per_sqm: number | null;
  areas: OccupancyAreaPreview[];
  sample: OccupancyBasicListing[];
}


export interface OccupancyDashboardData {
  metrics: OccupancyCityMetrics;
  listings_preview: OccupancyListingsPreview | null;
  snapshot_diff: OccupancySnapshotDiff | null;
  map_listings: OccupancyMapListing[];
  available_snapshots: OccupancySnapshotSummary[];
  selected_snapshot_at: string | null;
  selected_portal: OccupancyPortal;
  selected_city: import("@/lib/occupancy/cities").OccupancyCitySlug;
}
