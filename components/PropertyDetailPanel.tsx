"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { loadCityListingsCacheFirst } from "@/lib/cache-first";
import { criteriaFromDetail, filterSimilarRentals } from "@/lib/similar-listings";
import {
  DEFAULT_SIMILAR_RENT_FILTERS,
  SIMILAR_RENT_LIMIT_OPTIONS,
  SIMILAR_RENT_RADIUS_PRESETS,
  radiusMFromPreset,
  radiusPresetFromMeters,
  radiusPresetLabel,
  similarRentLimitFromSelect,
  similarRentLimitSelectValue,
  similarRentSearchOptionsFromState,
  type SimilarRentFilterState,
} from "@/lib/similar-rent-filters";
import { propertyDetailCacheFileLabel } from "@/lib/property-detail-cache-client";
import {
  estimateRentableRooms,
  estimateWholeFlatRent,
  inferRentPriceBasis,
  listingWithEffectiveRent,
  rentPriceBasisBadgeClass,
  rentPriceBasisLabel,
  similarRentEstimateSummary,
  SINGLE_RENTABLE_ROOM_PREMIUM,
  type SimilarRentEstimateMethod,
} from "@/lib/rent-price-basis";
import type { ListingProfitSettings } from "@/lib/listing-profit-settings";
import { formatListingsWebsiteSource, inferListingWebsiteSource } from "@/lib/listing-url";
import type { ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import { ITALY_DEFAULTS, RENOVATION_EUR_PER_SQM, listingRenovationCostRange } from "@/lib/constants";
import { CZECH_DEFAULTS } from "@/lib/constants-cz";
import { listingsUiLabels, type ListingsUiLabels } from "@/lib/listings-ui-labels";
import { useI18n } from "@/lib/i18n/context";
import { monthlyMortgagePayment } from "@/lib/engine/mortgage";
import { cn, fmtMoney } from "@/lib/utils";
import {
  Bath,
  Building2,
  ExternalLink,
  Hammer,
  Layers,
  LayoutDashboard,
  Loader2,
  MapPin,
  Ruler,
  Sparkles,
  Thermometer,
  X,
  Zap,
} from "lucide-react";

const PropertySimilarRentMap = dynamic(() => import("./PropertySimilarRentMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center rounded-xl border border-surface-border/60 text-sm text-neutral-500">
      Loading map…
    </div>
  ),
});

interface Props {
  open: boolean;
  detail: ListingDetail | null;
  loading: boolean;
  error: string | null;
  provider: ListingsProvider;
  cacheSource?: "server" | "local" | null;
  mapCity?: string;
  market?: import("@/lib/markets").MarketId;
  profitSettings?: ListingProfitSettings;
  onClose: () => void;
  onOpenSimilarRent?: (saleDetail: ListingDetail, rentListing: MapListing) => void;
  onUseAverageRent?: (
    saleDetail: ListingDetail,
    similarRentals: MapListing[],
    estimateMethod: SimilarRentEstimateMethod,
  ) => void;
}

function Spec({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border/60 bg-neutral-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
        <Icon size={13} className="text-neutral-900/80" />
        {label}
      </div>
      <p className="text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function boolLabel(
  v: boolean | null,
  yes: string,
  no: string,
  unknown = "—",
) {
  if (v === true) return yes;
  if (v === false) return no;
  return unknown;
}

export default function PropertyDetailPanel({
  open,
  detail,
  loading,
  error,
  provider,
  cacheSource,
  mapCity,
  market = "it",
  profitSettings,
  onClose,
  onOpenSimilarRent,
  onUseAverageRent,
}: Props) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [rentPool, setRentPool] = useState<MapListing[]>([]);
  const [similarFilters, setSimilarFilters] = useState<SimilarRentFilterState>(DEFAULT_SIMILAR_RENT_FILTERS);
  const [similarColumnOpen, setSimilarColumnOpen] = useState(true);

  function filtersFromProfitSettings(settings: ListingProfitSettings): SimilarRentFilterState {
    return {
      ...DEFAULT_SIMILAR_RENT_FILTERS,
      radiusPresetId: radiusPresetFromMeters(settings.radiusM),
      rentEstimateMethod: settings.rentMethod,
    };
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setRentPool([]);
      setSimilarError(null);
      setSimilarLoading(false);
      setDescriptionExpanded(false);
      setSimilarFilters(DEFAULT_SIMILAR_RENT_FILTERS);
      setSimilarColumnOpen(true);
    }
  }, [open, detail?.id]);

  useEffect(() => {
    if (!open || !detail) return;
    setSimilarFilters(
      profitSettings ? filtersFromProfitSettings(profitSettings) : DEFAULT_SIMILAR_RENT_FILTERS,
    );
    setSimilarColumnOpen(true);
  }, [open, detail?.id]);

  const findSimilarRentals = useCallback(async () => {
    if (!detail) return;
    setSimilarLoading(true);
    setSimilarError(null);
    setRentPool([]);
    try {
      const criteria = criteriaFromDetail(detail, mapCity);
      if (!criteria.zone && (criteria.lat == null || criteria.lng == null)) {
        setSimilarError(t("propertyDetail.noZoneError"));
        return;
      }
      const { data: cache } = await loadCityListingsCacheFirst(market, criteria.city, "rent", false, provider);
      if (!cache.listings.length) {
        setSimilarError(t("propertyDetail.noRentCache", { city: criteria.city }));
        return;
      }
      setRentPool(cache.listings);
    } catch (e) {
      setSimilarError(e instanceof Error ? e.message : t("propertyDetail.searchFailed"));
    } finally {
      setSimilarLoading(false);
    }
  }, [detail, mapCity, market, provider, t]);

  const similarRentals = useMemo(() => {
    if (!detail || !rentPool.length) return null;
    const criteria = criteriaFromDetail(detail, mapCity);
    const searchOptions = similarRentSearchOptionsFromState(similarFilters, detail);
    return filterSimilarRentals(rentPool, criteria, searchOptions);
  }, [detail, mapCity, rentPool, similarFilters]);

  const similarRadiusM = radiusMFromPreset(similarFilters.radiusPresetId);
  const similarRadiusLabel = radiusPresetLabel(similarFilters.radiusPresetId);
  const rentEstimateMethod = similarFilters.rentEstimateMethod;
  const similarFilteredEmpty = rentPool.length > 0 && similarRentals != null && similarRentals.length === 0;

  useEffect(() => {
    if (!open || loading || !detail || detail.operation !== "sale") return;
    void findSimilarRentals();
  }, [open, loading, detail?.id, detail?.operation, findSimilarRentals]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const ui = listingsUiLabels(market, t);
  const fmt = (n: number) => fmtMoney(n, market);
  const marketDefaults = market === "cz" ? CZECH_DEFAULTS : ITALY_DEFAULTS;
  const currencyUnit = market === "cz" ? "Kč" : "€";
  const pricePerSqmLabel = `${currencyUnit}/m²`;
  const yesLabel = t("propertyDetail.yes");
  const noLabel = t("propertyDetail.no");

  const priceLabel =
    detail?.operation === "rent"
      ? `${fmt(detail.price)}${ui.perMonth}`
      : detail
        ? fmt(detail.price)
        : "";

  const showSimilarColumn = detail?.operation === "sale" && !loading && similarColumnOpen;
  const similarRentSummary =
    detail && similarRentals && similarRentals.length > 0
      ? similarRentEstimateSummary(detail, similarRentals, rentEstimateMethod)
      : null;
  const avgRentPerSqm = similarRentSummary?.avgRentPerSqm ?? null;
  const avgWholeMonthly = similarRentSummary?.avgWholeMonthly ?? null;
  const avgRentPerRoom = similarRentSummary?.avgRentPerRoom ?? null;
  const wholeEstimateMode = similarRentSummary?.wholeEstimateMode ?? null;
  const estimateSampleCount = similarRentSummary?.estimateSampleCount ?? 0;
  const comparableCount = similarRentSummary?.comparableCount ?? 0;
  const canUseSqmEstimate =
    rentEstimateMethod === "per_sqm" &&
    detail?.sqm != null &&
    detail.sqm > 0 &&
    avgRentPerSqm != null &&
    avgWholeMonthly != null;
  const canUseRoomEstimate =
    rentEstimateMethod === "per_room" && avgRentPerRoom != null && avgWholeMonthly != null;
  const canUseRentEstimate = canUseSqmEstimate || canUseRoomEstimate;

  const rentableRooms = estimateRentableRooms(detail?.rooms);
  const estimatedRenovation =
    detail != null
      ? listingRenovationCostRange(detail.needs_renovation, detail.sqm, detail.price)
      : null;

  const quickMortgageMonthly =
    detail?.operation === "sale" && detail.price > 0
      ? monthlyMortgagePayment(
          detail.price * (1 - marketDefaults.investment_down_payment_pct / 100),
          marketDefaults.mortgage_rate_pct,
          marketDefaults.default_loan_years,
        )
      : null;

  const closeSimilarColumn = () => {
    setSimilarColumnOpen(false);
    setSimilarError(null);
    setSimilarLoading(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 p-4 "
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("propertyDetail.ariaModal")}
    >
      <div
        className={cn(
          "card flex max-h-[90vh] w-full overflow-hidden shadow-2xl",
          showSimilarColumn ? "max-w-6xl flex-row" : "max-w-2xl flex-col",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-surface-border bg-white px-5 py-4 ">
            <div className="min-w-0 flex-1">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <Loader2 size={16} className="animate-spin text-neutral-900" />
                  {t("propertyDetail.loadingPanel")}
                </div>
              ) : error ? (
                <p className="text-sm text-red-400">{error}</p>
              ) : detail ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-900">{t("propertyDetail.sheetTitle")}</p>
                  <h3 className="mt-1 text-base font-semibold text-neutral-900">{detail.title}</h3>
                  <p className="mt-1 text-lg font-bold text-neutral-900">{priceLabel}</p>
                  {quickMortgageMonthly != null && quickMortgageMonthly > 0 && (
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {t("propertyDetail.mortgageEstimate", {
                        years: marketDefaults.default_loan_years,
                        rate: marketDefaults.mortgage_rate_pct,
                      })}
                      <span className="font-medium text-neutral-700">
                        {fmt(quickMortgageMonthly)}{ui.perMonth}
                      </span>
                    </p>
                  )}
                  {(detail.zone || detail.city_label) && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                      <MapPin size={12} />
                      {[detail.zone, detail.city_label].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </>
              ) : null}
            </div>
            <div className="flex shrink-0 items-start gap-2">
              {detail && !loading && !error && (
                <a
                  href={detail.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-border px-4 py-2.5",
                    "text-sm text-neutral-700 hover:bg-neutral-100",
                  )}
                >
                  <ExternalLink size={14} />
                  {formatListingsWebsiteSource(inferListingWebsiteSource(detail)) ?? t("propertyDetail.listing")}
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-surface-border p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                aria-label={t("propertyDetail.close")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {detail && !loading && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {detail.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {detail.images.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="h-32 w-44 shrink-0 rounded-xl border border-surface-border/60 object-cover"
                  />
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <Spec icon={Ruler} label={t("propertyDetail.surface")} value={detail.sqm != null ? `${detail.sqm} m²` : "—"} />
              <Spec icon={Building2} label={t("propertyDetail.rooms")} value={detail.rooms != null ? String(detail.rooms) : "—"} />
              {rentableRooms != null && detail.rooms != null && detail.rooms > 2 && (
                <Spec
                  icon={Building2}
                  label={t("propertyDetail.rentableRooms")}
                  value={String(rentableRooms)}
                />
              )}
              <Spec icon={Bath} label={t("propertyDetail.bathrooms")} value={detail.bathrooms != null ? String(detail.bathrooms) : "—"} />
              <Spec icon={Layers} label={t("propertyDetail.floor")} value={detail.floor ?? "—"} />
              <Spec
                icon={Zap}
                label={t("propertyDetail.energyClass")}
                value={
                  detail.energy_class
                    ? `${detail.energy_class}${detail.energy_kwh_sqm ? ` (${detail.energy_kwh_sqm} kWh/m²)` : ""}`
                    : "—"
                }
              />
              <Spec
                icon={Sparkles}
                label={t("propertyDetail.condition")}
                value={
                  detail.condition ??
                  (detail.needs_renovation === true
                    ? t("propertyDetail.needsRenovation")
                    : detail.needs_renovation === false
                      ? t("propertyDetail.goodCondition")
                      : "—")
                }
              />
              {estimatedRenovation != null && (
                <Spec
                  icon={Hammer}
                  label={t("propertyDetail.renovationEstimate")}
                  value={`${fmt(estimatedRenovation.min)} – ${fmt(estimatedRenovation.max)} (${RENOVATION_EUR_PER_SQM.min}–${RENOVATION_EUR_PER_SQM.max} ${pricePerSqmLabel})`}
                />
              )}
              <Spec
                icon={Thermometer}
                label={pricePerSqmLabel}
                value={detail.price_per_sqm != null ? fmt(detail.price_per_sqm) : "—"}
              />
              <Spec
                icon={Building2}
                label={t("propertyDetail.hoa")}
                value={detail.condominio_monthly != null ? `${fmt(detail.condominio_monthly)}${ui.perMonth}` : "—"}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                { label: t("propertyDetail.propertyType"), value: detail.property_type_label ?? "—" },
                { label: t("propertyDetail.lift"), value: boolLabel(detail.lift, yesLabel, noLabel) },
                { label: t("propertyDetail.garden"), value: boolLabel(detail.garden, yesLabel, noLabel) },
                { label: t("propertyDetail.terrace"), value: boolLabel(detail.terrace, yesLabel, noLabel) },
                { label: t("propertyDetail.garage"), value: boolLabel(detail.garage, yesLabel, noLabel) },
                { label: t("propertyDetail.furnished"), value: detail.furnished ?? "—" },
                { label: t("propertyDetail.builtYear"), value: detail.built_year != null ? String(detail.built_year) : "—" },
                { label: t("propertyDetail.zone"), value: detail.zone ?? "—" },
              ].map((row) => (
                <div key={row.label} className="rounded-lg bg-surface-border/20 px-3 py-2">
                  <p className="text-neutral-500">{row.label}</p>
                  <p className="font-medium text-neutral-800">{row.value}</p>
                </div>
              ))}
            </div>

            {detail.operation === "sale" && (
              <PropertySimilarRentMap
                saleProperty={detail}
                similarRentals={similarRentals}
                loading={similarLoading}
                radiusM={similarRadiusM}
                market={market}
              />
            )}

            {detail.description && (
              <div className="rounded-xl border border-surface-border/60 bg-white p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t("propertyDetail.description")}</p>
                  {detail.description.length > 120 && (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((v) => !v)}
                      className="shrink-0 text-xs font-medium text-neutral-900 hover:text-neutral-900/80"
                    >
                      {descriptionExpanded ? t("propertyDetail.showLess") : t("propertyDetail.showMore")}
                    </button>
                  )}
                </div>
                <div
                  role={descriptionExpanded ? undefined : "button"}
                  tabIndex={descriptionExpanded ? undefined : 0}
                  onClick={descriptionExpanded ? undefined : () => setDescriptionExpanded(true)}
                  onKeyDown={
                    descriptionExpanded
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDescriptionExpanded(true);
                          }
                        }
                  }
                  className={cn(
                    "text-sm leading-snug text-neutral-700",
                    descriptionExpanded
                      ? "max-h-36 overflow-y-auto pr-1"
                      : "max-h-[3.25rem] cursor-pointer overflow-hidden line-clamp-2",
                  )}
                >
                  {detail.description}
                </div>
              </div>
            )}

            {cacheSource && detail.fetched_at && (
              <p className="text-xs text-neutral-500">
                {cacheSource === "server"
                  ? t("propertyDetail.fromCacheServer", { file: propertyDetailCacheFileLabel(detail.id) })
                  : t("propertyDetail.fromCacheBrowser")}
                {" · "}
                {new Date(detail.fetched_at).toLocaleString("it-IT")}
              </p>
            )}
          </div>
          )}

          {error && !loading && (
            <div className="px-5 pb-5">
              <button type="button" onClick={onClose} className="btn-primary !w-auto px-5">
                {t("propertyDetail.close")}
              </button>
            </div>
          )}
        </div>

        {showSimilarColumn && detail && (
          <aside className="flex min-h-0 w-80 shrink-0 flex-col border-l border-surface-border bg-neutral-50 xl:w-96">
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-neutral-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-900">{t("propertyDetail.similarTitle")}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {t("propertyDetail.sameZone")}
                    {detail.zone ? `: ${detail.zone}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSimilarColumn}
                  className="rounded-lg border border-surface-border p-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                  aria-label={t("propertyDetail.closeSimilar")}
                >
                  <X size={14} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {similarLoading && (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-600">
                    <Loader2 size={16} className="animate-spin text-neutral-900" />
                    {t("propertyDetail.searching")}
                  </div>
                )}

                {similarError && !similarLoading && (
                  <p className="text-sm text-amber-400">{similarError}</p>
                )}

                {similarFilteredEmpty && !similarLoading && !similarError && (
                  <p className="text-sm text-amber-400">
                    {t("propertyDetail.noFilterMatches")}
                  </p>
                )}

                {!similarLoading && rentPool.length > 0 && (
                  <div className="mb-3 space-y-2 rounded-lg border border-surface-border/60 bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      {t("propertyDetail.comparableFilters")}
                    </p>
                    <label className="block text-xs text-neutral-600">
                      {t("propertyDetail.rentEstimateMethod")}
                      <select
                        value={similarFilters.rentEstimateMethod}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            rentEstimateMethod: e.target.value as SimilarRentEstimateMethod,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-white px-2 py-1.5 text-sm text-neutral-800"
                      >
                        <option value="per_sqm">
                          {t("propertyDetail.avgPerSqmInArea", { unit: pricePerSqmLabel })}
                        </option>
                        <option value="per_room">
                          {t("propertyDetail.avgPerRoomInArea", { unit: ui.perRoom })}
                        </option>
                      </select>
                    </label>
                    <label className="block text-xs text-neutral-600">
                      {t("propertyDetail.radius")}
                      <select
                        value={similarFilters.radiusPresetId}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            radiusPresetId: e.target.value as SimilarRentFilterState["radiusPresetId"],
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-white px-2 py-1.5 text-sm text-neutral-800"
                      >
                        {SIMILAR_RENT_RADIUS_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-neutral-600">
                      {t("propertyDetail.rooms")}
                      <select
                        value={similarFilters.roomsFilter}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            roomsFilter: e.target.value as SimilarRentFilterState["roomsFilter"],
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-white px-2 py-1.5 text-sm text-neutral-800"
                      >
                        <option value="any">{t("propertyDetail.any")}</option>
                        <option value="similar">
                          {t("propertyDetail.similarRooms", {
                            suffix: detail.rooms != null ? ` (±1 from ${detail.rooms})` : " (±1)",
                          })}
                        </option>
                        <option value="match">
                          {t("propertyDetail.matchRooms", {
                            suffix: detail.rooms != null ? ` (${detail.rooms})` : "",
                          })}
                        </option>
                      </select>
                    </label>
                    <label className="block text-xs text-neutral-600">
                      {t("propertyDetail.sqmLabel")}
                      <select
                        value={similarFilters.sqmFilter}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            sqmFilter: e.target.value as SimilarRentFilterState["sqmFilter"],
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-white px-2 py-1.5 text-sm text-neutral-800"
                      >
                        <option value="any">{t("propertyDetail.any")}</option>
                        <option value="similar">
                          {t("propertyDetail.similarSqm", {
                            suffix: detail.sqm != null && detail.sqm > 0 ? ` (from ${detail.sqm} m²)` : "",
                          })}
                        </option>
                      </select>
                    </label>
                    {detail.property_type && (
                      <label className="block text-xs text-neutral-600">
                        {t("propertyDetail.typeLabel")}
                        <select
                          value={similarFilters.propertyTypeFilter}
                          onChange={(e) =>
                            setSimilarFilters((f) => ({
                              ...f,
                              propertyTypeFilter: e.target.value as SimilarRentFilterState["propertyTypeFilter"],
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-surface-border bg-white px-2 py-1.5 text-sm text-neutral-800"
                        >
                          <option value="any">{t("propertyDetail.any")}</option>
                          <option value="match">{t("propertyDetail.sameType", { type: detail.property_type })}</option>
                        </select>
                      </label>
                    )}
                    <label className="block text-xs text-neutral-600">
                      {t("propertyDetail.maxComparables")}
                      <select
                        value={similarRentLimitSelectValue(similarFilters.limit)}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            limit: similarRentLimitFromSelect(e.target.value),
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-white px-2 py-1.5 text-sm text-neutral-800"
                      >
                        {SIMILAR_RENT_LIMIT_OPTIONS.map((opt) => (
                          <option
                            key={opt.value == null ? "all" : opt.value}
                            value={opt.value == null ? "all" : String(opt.value)}
                          >
                            {opt.value == null ? t("propertyDetail.any") : opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {similarRentals && similarRentals.length > 0 && !similarLoading && (
                  <>
                    {canUseRentEstimate && (
                      <div className="mb-3 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-900">
                          {rentEstimateMethod === "per_sqm"
                            ? t("propertyDetail.rentEstimateSqm", { unit: pricePerSqmLabel })
                            : t("propertyDetail.rentEstimateRoom", { unit: ui.perRoom })}
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-neutral-900">
                          {fmt(avgWholeMonthly!)}
                          <span className="text-sm font-normal text-neutral-600">{ui.perMonth}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {estimateSampleCount === comparableCount
                            ? t("propertyDetail.avgFromCount", {
                                count: estimateSampleCount,
                                radius: similarRadiusLabel,
                              })
                            : t("propertyDetail.avgFromCountFiltered", {
                                count: estimateSampleCount,
                                filtered: comparableCount,
                                radius: similarRadiusLabel,
                              })}
                          {rentEstimateMethod === "per_sqm" ? (
                            <>
                              {" · "}
                              {fmt(Math.round(avgRentPerSqm!))}
                              {ui.perSqm} × {detail.sqm} m² = {fmt(avgWholeMonthly!)}
                              {ui.perMonth}
                            </>
                          ) : wholeEstimateMode === "under_two_locali" ? (
                            <>
                              {" · "}
                              {fmt(avgRentPerRoom!)}
                              {ui.perRoom} × {SINGLE_RENTABLE_ROOM_PREMIUM} = {fmt(avgWholeMonthly!)}
                              {ui.perMonth}
                            </>
                          ) : (
                            <>
                              {" · "}
                              {fmt(avgRentPerRoom!)}
                              {ui.perRoom} × {rentableRooms ?? "?"}{" "}
                              {t("propertyDetail.roomsUnit")} = {fmt(avgWholeMonthly!)}
                              {ui.perMonth}
                            </>
                          )}
                        </p>
                        <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                          {rentEstimateMethod === "per_sqm"
                            ? t("propertyDetail.hintPerSqm", {
                                unit: pricePerSqmLabel,
                                sqm: detail.sqm ?? 0,
                              })
                            : wholeEstimateMode === "under_two_locali"
                              ? t("propertyDetail.hintUnderTwoRooms", {
                                  perRoom: ui.perRoom,
                                  pct: Math.round((SINGLE_RENTABLE_ROOM_PREMIUM - 1) * 100),
                                })
                              : t("propertyDetail.hintPerRoom", { perRoom: ui.perRoom })}
                        </p>
                        {onUseAverageRent && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!similarRentals) return;
                              onUseAverageRent(detail, similarRentals, rentEstimateMethod);
                              onClose();
                            }}
                            className={cn(
                              "mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300",
                              "bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900 hover:hover:bg-neutral-200",
                            )}
                          >
                            <LayoutDashboard size={12} />
                            {t("propertyDetail.useAverageInAnalysis")}
                          </button>
                        )}
                      </div>
                    )}
                    {!canUseRentEstimate && (
                      <p className="mb-3 text-xs text-amber-400">
                        {rentEstimateMethod === "per_sqm"
                          ? t("propertyDetail.needSqmEstimate", { unit: pricePerSqmLabel })
                          : t("propertyDetail.needRoomEstimate", { unit: `${currencyUnit}${ui.perRoom}` })}
                      </p>
                    )}
                    <div className="space-y-2">
                      {similarRentals.map((rent) => {
                        const basis = inferRentPriceBasis(rent);
                        const wholeFlat = estimateWholeFlatRent(rent, basis);
                        const rentForAnalysis = listingWithEffectiveRent(rent);
                        return (
                          <div
                            key={rent.id}
                            className="rounded-lg border border-surface-border/60 bg-neutral-50 p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-neutral-800 line-clamp-2">{rent.title}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className="text-xs text-neutral-500">
                                  {wholeFlat
                                    ? t("propertyDetail.perRoomLine", {
                                        price: fmt(wholeFlat.pricePerRoom),
                                        perMonth: ui.perMonth,
                                        rooms: wholeFlat.roomCount,
                                        total: fmt(wholeFlat.totalMonthly),
                                      })
                                    : [
                                        `${fmt(rent.price)}${ui.perMonth}`,
                                        rent.sqm != null && `${rent.sqm} m²`,
                                        rent.rooms != null && `${rent.rooms} ${t("propertyDetail.roomsUnit")}`,
                                        rent.sqm != null &&
                                          rent.sqm > 0 &&
                                          `${fmt(Math.round(rent.price / rent.sqm))}${ui.perSqm}`,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </p>
                                <span
                                  className={cn(
                                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                    rentPriceBasisBadgeClass(basis),
                                  )}
                                >
                                  {rentPriceBasisLabel(basis)}
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-col gap-1.5">
                              <a
                                href={rent.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "inline-flex items-center justify-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5",
                                  "text-xs text-neutral-700 hover:bg-neutral-100",
                                )}
                              >
                                <ExternalLink size={12} />
                                {formatListingsWebsiteSource(inferListingWebsiteSource(rent)) ?? t("propertyDetail.listing")}
                              </a>
                              <button
                                type="button"
                                onClick={() => onOpenSimilarRent?.(detail, rentForAnalysis)}
                                className={cn(
                                  "inline-flex items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-neutral-50 px-2.5 py-1.5",
                                  "text-xs font-medium text-neutral-900 hover:bg-neutral-100",
                                )}
                              >
                                <LayoutDashboard size={12} />
                                {t("propertyDetail.openInDashboard")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </aside>
        )}
      </div>
    </div>,
    document.body,
  );
}
