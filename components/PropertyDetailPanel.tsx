"use client";

import type { ListingDetail } from "@/lib/types";
import { cn, fmtEuro } from "@/lib/utils";
import {
  Bath,
  Building2,
  ExternalLink,
  Layers,
  Loader2,
  MapPin,
  Ruler,
  Sparkles,
  Thermometer,
  X,
  Zap,
} from "lucide-react";

interface Props {
  detail: ListingDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onAnalyze: (detail: ListingDetail) => void;
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

export default function PropertyDetailPanel({ detail, loading, error, onClose, onAnalyze }: Props) {
  if (!detail && !loading && !error) return null;

  const priceLabel =
    detail?.operation === "rent"
      ? `${fmtEuro(detail.price)}/mese`
      : detail
        ? fmtEuro(detail.price)
        : "";

  return (
    <div className="border-t border-surface-border/80 bg-surface-raised/20">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
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
        <div className="space-y-4 px-5 pb-5">
          {detail.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {detail.images.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="h-28 w-40 shrink-0 rounded-xl object-cover border border-surface-border/60"
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

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
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
              <p className="text-sm leading-relaxed text-slate-300 line-clamp-6">{detail.description}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onAnalyze(detail)} className="btn-primary px-5">
              Usa per analisi
            </button>
            <a
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border border-surface-border px-4 py-2.5",
                "text-sm text-slate-300 hover:bg-surface-raised",
              )}
            >
              <ExternalLink size={14} />
              Apri su Idealista
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
