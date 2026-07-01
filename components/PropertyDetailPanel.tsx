"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { loadCityListingsCacheFirst } from "@/lib/cache-first";
import { criteriaFromDetail, filterSimilarRentals } from "@/lib/similar-listings";
import { propertyDetailCacheFileLabel } from "@/lib/property-detail-cache-client";
import {
  averageMonthlyRentPerRoom,
  estimateRentableRooms,
  estimateWholeFlatRent,
  inferRentPriceBasis,
  listingWithEffectiveRent,
  rentableRoomsAssumption,
  rentPriceBasisBadgeClass,
  rentPriceBasisLabel,
} from "@/lib/rent-price-basis";
import type { ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import { ITALY_DEFAULTS } from "@/lib/constants";
import { monthlyMortgagePayment } from "@/lib/engine/mortgage";
import { cn, fmtEuro } from "@/lib/utils";
import {
  Bath,
  Building2,
  ExternalLink,
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
  onClose: () => void;
  onOpenSimilarRent?: (saleDetail: ListingDetail, rentListing: MapListing) => void;
  onUseAverageRent?: (
    saleDetail: ListingDetail,
    avgPerRoom: number,
    wholeMonthly: number | null,
    similarRentals: MapListing[],
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
  onClose,
  onOpenSimilarRent,
  onUseAverageRent,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [similarRentals, setSimilarRentals] = useState<MapListing[] | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSimilarRentals(null);
      setSimilarError(null);
      setSimilarLoading(false);
      setDescriptionExpanded(false);
    }
  }, [open, detail?.id]);

  const findSimilarRentals = useCallback(async () => {
    if (!detail) return;
    setSimilarLoading(true);
    setSimilarError(null);
    setSimilarRentals(null);
    try {
      const criteria = criteriaFromDetail(detail, mapCity);
      if (!criteria.zone && (criteria.lat == null || criteria.lng == null)) {
        setSimilarError("Zona o posizione non disponibili — impossibile cercare affitti nella stessa area.");
        return;
      }
      const { data: cache } = await loadCityListingsCacheFirst(criteria.city, "rent", false, provider);
      const matches = filterSimilarRentals(cache.listings, criteria);
      if (!matches.length) {
        setSimilarError(`Nessun affitto trovato in ${criteria.zone}. Prova ad aggiornare gli annunci affitto in mappa.`);
      } else {
        setSimilarRentals(matches);
      }
    } catch (e) {
      setSimilarError(e instanceof Error ? e.message : "Ricerca affitti non riuscita");
    } finally {
      setSimilarLoading(false);
    }
  }, [detail, mapCity, provider]);

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

  const priceLabel =
    detail?.operation === "rent"
      ? `${fmtEuro(detail.price)}/mese`
      : detail
        ? fmtEuro(detail.price)
        : "";

  const showSimilarColumn = detail?.operation === "sale" && !loading;
  const avgRentPerRoom =
    similarRentals && similarRentals.length > 0
      ? averageMonthlyRentPerRoom(similarRentals)
      : null;

  const rentableRooms = estimateRentableRooms(detail?.rooms);
  const rentableRoomsNote = rentableRoomsAssumption(detail?.rooms);

  const avgWholeMonthly =
    avgRentPerRoom != null && rentableRooms != null
      ? avgRentPerRoom * rentableRooms
      : null;

  const quickMortgageMonthly =
    detail?.operation === "sale" && detail.price > 0
      ? monthlyMortgagePayment(
          detail.price * (1 - ITALY_DEFAULTS.investment_down_payment_pct / 100),
          ITALY_DEFAULTS.mortgage_rate_pct,
          ITALY_DEFAULTS.default_loan_years,
        )
      : null;

  const closeSimilarColumn = () => {
    setSimilarRentals(null);
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
                      Stima mutuo mensile su 30 anni con tassi al 3%:{" "}
                      <span className="font-medium text-slate-300">
                        {fmtEuro(quickMortgageMonthly)}/mese
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
                  Idealista
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
              {rentableRooms != null && detail.rooms != null && detail.rooms > 1 && (
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
                  detail.needs_renovation === true
                    ? "Da ristrutturare"
                    : detail.condition ?? (detail.needs_renovation === false ? "Non da ristrutturare" : "—")
                }
              />
              <Spec
                icon={Thermometer}
                label="€/m²"
                value={detail.price_per_sqm != null ? fmtEuro(detail.price_per_sqm) : "—"}
              />
              <Spec
                icon={Building2}
                label="Condominio"
                value={detail.condominio_monthly != null ? `${fmtEuro(detail.condominio_monthly)}/mese` : "—"}
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

                {similarRentals && similarRentals.length > 0 && !similarLoading && (
                  <>
                    {avgRentPerRoom != null && (
                      <div className="mb-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-accent">
                          Media affitto per stanza
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-slate-100">
                          {fmtEuro(avgRentPerRoom)}
                          <span className="text-sm font-normal text-slate-400">/mese/stanza</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Su {similarRentals.length} annunci in zona
                          {avgWholeMonthly != null && rentableRooms != null && (
                            <>
                              {" "}
                              · intero stimato{" "}
                              <span className="font-medium text-slate-300">
                                {fmtEuro(avgWholeMonthly)}/mese
                              </span>
                              {" "}
                              ({fmtEuro(avgRentPerRoom!)} × {rentableRooms} stanze)
                            </>
                          )}
                        </p>
                        {rentableRoomsNote && (
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{rentableRoomsNote}</p>
                        )}
                        {onUseAverageRent && avgRentPerRoom != null && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!similarRentals) return;
                              onUseAverageRent(detail, avgRentPerRoom, avgWholeMonthly, similarRentals);
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
                      Per annunci «stanza»: stima intero = prezzo stanza × locali dell&apos;annuncio. Per
                      l&apos;immobile in vendita si usano le stanze affittabili stimate (locali − 1 soggiorno).
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
                                        `${fmtEuro(wholeFlat.pricePerRoom)}/mese/stanza`,
                                        `${wholeFlat.roomCount} locali`,
                                        `→ ${fmtEuro(wholeFlat.totalMonthly)}/mese intero stimato`,
                                      ].join(" · ")
                                    : [
                                        `${fmtEuro(rent.price)}/mese`,
                                        rent.sqm != null && `${rent.sqm} m²`,
                                        rent.rooms != null && `${rent.rooms} locali`,
                                        rent.sqm != null &&
                                          rent.sqm > 0 &&
                                          `${fmtEuro(Math.round(rent.price / rent.sqm))}/m²`,
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
                                Idealista
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
