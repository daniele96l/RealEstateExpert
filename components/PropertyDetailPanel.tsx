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
  type SimilarRentEstimateMethod,
} from "@/lib/rent-price-basis";
import { formatListingsWebsiteSource, inferListingWebsiteSource } from "@/lib/listing-url";
import type { ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import { ITALY_DEFAULTS, RENOVATION_EUR_PER_SQM, listingRenovationCostRange } from "@/lib/constants";
import { CZECH_DEFAULTS } from "@/lib/constants-cz";
import { listingsUiLabels } from "@/lib/listings-ui-labels";
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
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-surface-border/60 text-sm text-slate-500">
      Caricamento mappa…
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
    <div className="rounded-xl border border-surface-border/60 bg-surface-raised/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
        <Icon size={13} className="text-accent/80" />
        {label}
      </div>
      <p className="text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function boolLabel(v: boolean | null, yes = "Sì", no = "No", unknown = "—") {
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
  onClose,
  onOpenSimilarRent,
  onUseAverageRent,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [rentPool, setRentPool] = useState<MapListing[]>([]);
  const [similarFilters, setSimilarFilters] = useState<SimilarRentFilterState>(DEFAULT_SIMILAR_RENT_FILTERS);
  const rentEstimateMethod: SimilarRentEstimateMethod = "per_sqm";
  const [similarColumnOpen, setSimilarColumnOpen] = useState(true);

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
    setSimilarFilters(DEFAULT_SIMILAR_RENT_FILTERS);
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
        setSimilarError("Zona o posizione non disponibili — impossibile cercare affitti nella stessa area.");
        return;
      }
      const { data: cache } = await loadCityListingsCacheFirst(market, criteria.city, "rent", false, provider);
      if (!cache.listings.length) {
        setSimilarError(`Nessun affitto in cache per ${criteria.city}. Aggiorna gli annunci affitto in mappa.`);
        return;
      }
      setRentPool(cache.listings);
    } catch (e) {
      setSimilarError(e instanceof Error ? e.message : "Ricerca affitti non riuscita");
    } finally {
      setSimilarLoading(false);
    }
  }, [detail, mapCity, market, provider]);

  const similarRentals = useMemo(() => {
    if (!detail || !rentPool.length) return null;
    const criteria = criteriaFromDetail(detail, mapCity);
    const searchOptions = similarRentSearchOptionsFromState(similarFilters, detail);
    return filterSimilarRentals(rentPool, criteria, searchOptions);
  }, [detail, mapCity, rentPool, similarFilters]);

  const similarRadiusM = radiusMFromPreset(similarFilters.radiusPresetId);
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

  const ui = listingsUiLabels(market);
  const fmt = (n: number) => fmtMoney(n, market);
  const marketDefaults = market === "cz" ? CZECH_DEFAULTS : ITALY_DEFAULTS;
  const pricePerSqmLabel = market === "cz" ? "Kč/m²" : "€/m²";

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
  const canUseSqmEstimate =
    detail?.sqm != null && detail.sqm > 0 && avgRentPerSqm != null && avgWholeMonthly != null;

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Dettaglio immobile"
    >
      <div
        className={cn(
          "card-glass flex max-h-[90vh] w-full overflow-hidden shadow-2xl",
          showSimilarColumn ? "max-w-6xl flex-row" : "max-w-2xl flex-col",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-surface-border/80 bg-surface-raised/95 px-5 py-4 backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  Caricamento scheda immobile…
                </div>
              ) : error ? (
                <p className="text-sm text-red-400">{error}</p>
              ) : detail ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">Scheda immobile</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-100">{detail.title}</h3>
                  <p className="mt-1 text-lg font-bold text-accent">{priceLabel}</p>
                  {quickMortgageMonthly != null && quickMortgageMonthly > 0 && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {market === "cz"
                        ? `Odhad hypotéky na ${marketDefaults.default_loan_years} let při ${marketDefaults.mortgage_rate_pct}%: `
                        : `Stima mutuo mensile su ${marketDefaults.default_loan_years} anni con tassi al ${marketDefaults.mortgage_rate_pct}%: `}
                      <span className="font-medium text-slate-300">
                        {fmt(quickMortgageMonthly)}{ui.perMonth}
                      </span>
                    </p>
                  )}
                  {(detail.zone || detail.city_label) && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
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
                    "text-sm text-slate-300 hover:bg-surface-raised",
                  )}
                >
                  <ExternalLink size={14} />
                  {formatListingsWebsiteSource(inferListingWebsiteSource(detail)) ?? "Annuncio"}
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-surface-border p-1.5 text-slate-400 hover:bg-surface-border/40 hover:text-slate-200"
                aria-label="Chiudi"
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
              <Spec icon={Ruler} label="Superficie" value={detail.sqm != null ? `${detail.sqm} m²` : "—"} />
              <Spec icon={Building2} label="Locali" value={detail.rooms != null ? String(detail.rooms) : "—"} />
              {rentableRooms != null && detail.rooms != null && detail.rooms > 2 && (
                <Spec
                  icon={Building2}
                  label="Stanze affittabili (stima)"
                  value={String(rentableRooms)}
                />
              )}
              <Spec icon={Bath} label="Bagni" value={detail.bathrooms != null ? String(detail.bathrooms) : "—"} />
              <Spec icon={Layers} label="Piano" value={detail.floor ?? "—"} />
              <Spec
                icon={Zap}
                label="Classe energetica"
                value={
                  detail.energy_class
                    ? `${detail.energy_class}${detail.energy_kwh_sqm ? ` (${detail.energy_kwh_sqm} kWh/m²)` : ""}`
                    : "—"
                }
              />
              <Spec
                icon={Sparkles}
                label="Stato / ristrutturazione"
                value={
                  detail.condition ??
                  (detail.needs_renovation === true
                    ? "Da ristrutturare"
                    : detail.needs_renovation === false
                      ? "Buono stato"
                      : "—")
                }
              />
              {estimatedRenovation != null && (
                <Spec
                  icon={Hammer}
                  label="Stima ristrutturazione"
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
                label="Condominio"
                value={detail.condominio_monthly != null ? `${fmt(detail.condominio_monthly)}${ui.perMonth}` : "—"}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                { label: "Tipologia", value: detail.property_type_label ?? "—" },
                { label: "Ascensore", value: boolLabel(detail.lift) },
                { label: "Giardino", value: boolLabel(detail.garden) },
                { label: "Terrazzo", value: boolLabel(detail.terrace) },
                { label: "Garage", value: boolLabel(detail.garage) },
                { label: "Arredato", value: detail.furnished ?? "—" },
                { label: "Anno costruzione", value: detail.built_year != null ? String(detail.built_year) : "—" },
                { label: "Zona", value: detail.zone ?? "—" },
              ].map((row) => (
                <div key={row.label} className="rounded-lg bg-surface-border/20 px-3 py-2">
                  <p className="text-slate-500">{row.label}</p>
                  <p className="font-medium text-slate-200">{row.value}</p>
                </div>
              ))}
            </div>

            {detail.operation === "sale" && (
              <PropertySimilarRentMap
                saleProperty={detail}
                similarRentals={similarRentals}
                loading={similarLoading}
                radiusM={similarRadiusM}
              />
            )}

            {detail.description && (
              <div className="rounded-xl border border-surface-border/60 bg-surface-raised/30 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Descrizione</p>
                  {detail.description.length > 120 && (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((v) => !v)}
                      className="shrink-0 text-xs font-medium text-accent hover:text-accent/80"
                    >
                      {descriptionExpanded ? "Mostra meno" : "Mostra tutto"}
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
                    "text-sm leading-snug text-slate-300",
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
              <p className="text-xs text-slate-600">
                {cacheSource === "server"
                  ? `Da cache ${propertyDetailCacheFileLabel(detail.id)}`
                  : "Da cache browser"}
                {" · "}
                {new Date(detail.fetched_at).toLocaleString("it-IT")}
              </p>
            )}
          </div>
          )}

          {error && !loading && (
            <div className="px-5 pb-5">
              <button type="button" onClick={onClose} className="btn-primary !w-auto px-5">
                Chiudi
              </button>
            </div>
          )}
        </div>

        {showSimilarColumn && detail && (
          <aside className="flex min-h-0 w-80 shrink-0 flex-col border-l border-surface-border/80 bg-accent/5 xl:w-96">
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-accent/20 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">Affitti simili</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Stessa zona{detail.zone ? `: ${detail.zone}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSimilarColumn}
                  className="rounded-lg border border-surface-border p-1 text-slate-400 hover:bg-surface-border/40 hover:text-slate-200"
                  aria-label="Chiudi affitti simili"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {similarLoading && (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
                    <Loader2 size={16} className="animate-spin text-accent" />
                    Ricerca in corso…
                  </div>
                )}

                {similarError && !similarLoading && (
                  <p className="text-sm text-amber-400">{similarError}</p>
                )}

                {similarFilteredEmpty && !similarLoading && !similarError && (
                  <p className="text-sm text-amber-400">
                    Nessun affitto con i filtri attuali. Prova ad allargare il raggio o a ridurre i vincoli su
                    locali e metratura.
                  </p>
                )}

                {!similarLoading && rentPool.length > 0 && (
                  <div className="mb-3 space-y-2 rounded-lg border border-surface-border/60 bg-surface-raised/30 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Filtri comparabili
                    </p>
                    <label className="block text-xs text-slate-400">
                      Raggio
                      <select
                        value={similarFilters.radiusPresetId}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            radiusPresetId: e.target.value as SimilarRentFilterState["radiusPresetId"],
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-surface-raised/60 px-2 py-1.5 text-sm text-slate-200"
                      >
                        {SIMILAR_RENT_RADIUS_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-400">
                      Locali
                      <select
                        value={similarFilters.roomsFilter}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            roomsFilter: e.target.value as SimilarRentFilterState["roomsFilter"],
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-surface-raised/60 px-2 py-1.5 text-sm text-slate-200"
                      >
                        <option value="any">Qualsiasi</option>
                        <option value="similar">
                          Simili{detail.rooms != null ? ` (±1 da ${detail.rooms})` : " (±1)"}
                        </option>
                        <option value="match">
                          Uguali{detail.rooms != null ? ` (${detail.rooms})` : ""}
                        </option>
                      </select>
                    </label>
                    <label className="block text-xs text-slate-400">
                      Metratura
                      <select
                        value={similarFilters.sqmFilter}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            sqmFilter: e.target.value as SimilarRentFilterState["sqmFilter"],
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-surface-raised/60 px-2 py-1.5 text-sm text-slate-200"
                      >
                        <option value="any">Qualsiasi</option>
                        <option value="similar">
                          Simile ±25%
                          {detail.sqm != null && detail.sqm > 0 ? ` (da ${detail.sqm} m²)` : ""}
                        </option>
                      </select>
                    </label>
                    {detail.property_type && (
                      <label className="block text-xs text-slate-400">
                        Tipo
                        <select
                          value={similarFilters.propertyTypeFilter}
                          onChange={(e) =>
                            setSimilarFilters((f) => ({
                              ...f,
                              propertyTypeFilter: e.target.value as SimilarRentFilterState["propertyTypeFilter"],
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-surface-border bg-surface-raised/60 px-2 py-1.5 text-sm text-slate-200"
                        >
                          <option value="any">Qualsiasi</option>
                          <option value="match">Stesso tipo ({detail.property_type})</option>
                        </select>
                      </label>
                    )}
                    <label className="block text-xs text-slate-400">
                      Max comparabili
                      <select
                        value={similarRentLimitSelectValue(similarFilters.limit)}
                        onChange={(e) =>
                          setSimilarFilters((f) => ({
                            ...f,
                            limit: similarRentLimitFromSelect(e.target.value),
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-surface-border bg-surface-raised/60 px-2 py-1.5 text-sm text-slate-200"
                      >
                        {SIMILAR_RENT_LIMIT_OPTIONS.map((opt) => (
                          <option
                            key={opt.value == null ? "all" : opt.value}
                            value={opt.value == null ? "all" : String(opt.value)}
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {similarRentals && similarRentals.length > 0 && !similarLoading && (
                  <>
                    {canUseSqmEstimate && (
                      <div className="mb-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-accent">
                          {market === "cz" ? `Odhad nájmu (${pricePerSqmLabel})` : `Stima affitto (${pricePerSqmLabel})`}
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-slate-100">
                          {fmt(avgWholeMonthly!)}
                          <span className="text-sm font-normal text-slate-400">{ui.perMonth}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Su {similarRentals.length} affitti in zona ·{" "}
                          {fmt(Math.round(avgRentPerSqm!))}
                          {ui.perSqm} × {detail.sqm} m² = {fmt(avgWholeMonthly!)}{ui.perMonth}
                        </p>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                          Media mensile €/m² sugli affitti comparabili con metratura nota, applicata ai m²
                          dell&apos;immobile in vendita.
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
                              "mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40",
                              "bg-accent/15 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/25",
                            )}
                          >
                            <LayoutDashboard size={12} />
                            Usa medie nell&apos;analisi
                          </button>
                        )}
                      </div>
                    )}
                    <p className="mb-3 text-xs text-slate-500">
                      Stima basata sulla media €/m² degli affitti comparabili con metratura nota.
                    </p>
                    <div className="space-y-2">
                      {similarRentals.map((rent) => {
                        const basis = inferRentPriceBasis(rent);
                        const wholeFlat = estimateWholeFlatRent(rent, basis);
                        const rentForAnalysis = listingWithEffectiveRent(rent);
                        return (
                          <div
                            key={rent.id}
                            className="rounded-lg border border-surface-border/60 bg-surface-raised/40 p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-200 line-clamp-2">{rent.title}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className="text-xs text-slate-500">
                                  {wholeFlat
                                    ? [
                                        `${fmt(wholeFlat.pricePerRoom)}${ui.perMonth}/stanza`,
                                        `${wholeFlat.roomCount} locali`,
                                        `→ ${fmt(wholeFlat.totalMonthly)}${ui.perMonth} intero stimato`,
                                      ].join(" · ")
                                    : [
                                        `${fmt(rent.price)}${ui.perMonth}`,
                                        rent.sqm != null && `${rent.sqm} m²`,
                                        rent.rooms != null && `${rent.rooms} locali`,
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
                                  "text-xs text-slate-300 hover:bg-surface-raised",
                                )}
                              >
                                <ExternalLink size={12} />
                                {formatListingsWebsiteSource(inferListingWebsiteSource(rent)) ?? "Annuncio"}
                              </a>
                              <button
                                type="button"
                                onClick={() => onOpenSimilarRent?.(detail, rentForAnalysis)}
                                className={cn(
                                  "inline-flex items-center justify-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5",
                                  "text-xs font-medium text-accent hover:bg-accent/20",
                                )}
                              >
                                <LayoutDashboard size={12} />
                                Apri in dashboard
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
