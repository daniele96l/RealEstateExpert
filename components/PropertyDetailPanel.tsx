"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchListings } from "@/lib/api";
import { criteriaFromDetail, filterSimilarRentals } from "@/lib/similar-listings";
import { propertyDetailCacheFileLabel } from "@/lib/property-detail-cache-client";
import type { ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import { cn, fmtEuro } from "@/lib/utils";
import {
  Bath,
  Building2,
  ExternalLink,
  Layers,
  Loader2,
  MapPin,
  Ruler,
  Search,
  Sparkles,
  Thermometer,
  X,
  Zap,
} from "lucide-react";

interface Props {
  open: boolean;
  detail: ListingDetail | null;
  loading: boolean;
  error: string | null;
  provider: ListingsProvider;
  cacheSource?: "server" | "local" | null;
  onClose: () => void;
  onAnalyze: (detail: ListingDetail) => void;
  onUseSimilarRent?: (saleDetail: ListingDetail, rentListing: MapListing) => void;
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
  onClose,
  onAnalyze,
  onUseSimilarRent,
}: Props) {
  const [mounted, setMounted] = useState(false);
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
    }
  }, [open, detail?.id]);

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

  const findSimilarRentals = async () => {
    if (!detail) return;
    setSimilarLoading(true);
    setSimilarError(null);
    setSimilarRentals(null);
    try {
      const criteria = criteriaFromDetail(detail);
      const cache = await fetchListings(criteria.city, "rent", false, provider);
      const matches = filterSimilarRentals(cache.listings, criteria);
      if (!matches.length) {
        setSimilarError("Nessun affitto simile trovato. Prova ad aggiornare gli annunci affitto in mappa.");
      } else {
        setSimilarRentals(matches);
      }
    } catch (e) {
      setSimilarError(e instanceof Error ? e.message : "Ricerca affitti non riuscita");
    } finally {
      setSimilarLoading(false);
    }
  };

  if (!open || !mounted) return null;

  const priceLabel =
    detail?.operation === "rent"
      ? `${fmtEuro(detail.price)}/mese`
      : detail
        ? fmtEuro(detail.price)
        : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Dettaglio immobile"
    >
      <div
        className="card-glass max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-surface-border/80 bg-surface-raised/95 px-5 py-4 backdrop-blur-xl">
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
                {(detail.zone || detail.city_label) && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={12} />
                    {[detail.zone, detail.city_label].filter(Boolean).join(" · ")}
                  </p>
                )}
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-border p-1.5 text-slate-400 hover:bg-surface-border/40 hover:text-slate-200"
            aria-label="Chiudi"
          >
            <X size={16} />
          </button>
        </div>

        {detail && !loading && (
          <div className="space-y-4 px-5 py-5">
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

            {detail.description && (
              <div className="rounded-xl border border-surface-border/60 bg-surface-raised/30 p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Descrizione</p>
                <p className="line-clamp-8 text-sm leading-relaxed text-slate-300">{detail.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pb-1">
              <button
                type="button"
                onClick={() => {
                  onAnalyze(detail);
                  onClose();
                }}
                className="btn-primary !w-auto shrink-0 px-5"
              >
                Usa per analisi
              </button>
              {detail.operation === "sale" && (
                <button
                  type="button"
                  disabled={similarLoading}
                  onClick={findSimilarRentals}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5",
                    "text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50",
                  )}
                >
                  {similarLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Cerca affitti simili
                </button>
              )}
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
            </div>

            {similarError && <p className="text-sm text-amber-400">{similarError}</p>}

            {similarRentals && similarRentals.length > 0 && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-accent">
                  Affitti simili ({detail.sqm ?? "?"} m² · {detail.rooms ?? "?"} locali
                  {detail.zone ? ` · ${detail.zone}` : ""})
                </p>
                <div className="space-y-2">
                  {similarRentals.map((rent) => (
                    <div
                      key={rent.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border/60 bg-surface-raised/40 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-200 line-clamp-1">{rent.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[
                            `${fmtEuro(rent.price)}/mese`,
                            rent.sqm != null && `${rent.sqm} m²`,
                            rent.rooms != null && `${rent.rooms} locali`,
                            rent.sqm != null && rent.sqm > 0 && `${fmtEuro(Math.round(rent.price / rent.sqm))}/m²`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onUseSimilarRent?.(detail, rent);
                          onClose();
                        }}
                        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                      >
                        Usa questo affitto
                      </button>
                    </div>
                  ))}
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
    </div>,
    document.body,
  );
}
