"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import {
  DEFAULT_LISTING_PROFIT_SETTINGS,
  PROFIT_RADIUS_OPTIONS,
  type ListingProfitSettings,
} from "@/lib/listing-profit-settings";
import { cn } from "@/lib/utils";

interface Props {
  settings: ListingProfitSettings;
  onChange: (settings: ListingProfitSettings) => void;
}

export default function ListingProfitSettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const patch = (partial: Partial<ListingProfitSettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded-md p-1.5 text-slate-400 transition-colors hover:bg-surface-raised hover:text-slate-200",
          open && "bg-surface-raised text-accent",
        )}
        aria-label="Impostazioni calcolo utile"
        title="Impostazioni calcolo utile"
      >
        <Settings2 size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[min(280px,calc(100vw-2rem))] rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Calcolo utile
          </p>

          <label className="mb-2 block text-[11px] text-slate-500">
            Affitto stimato da vicini
            <select
              className="input-field mt-1 w-full py-1.5 text-xs"
              value={settings.rentMethod}
              onChange={(e) =>
                patch({ rentMethod: e.target.value === "per_room" ? "per_room" : "per_sqm" })
              }
            >
              <option value="per_sqm">Media €/m² in zona</option>
              <option value="per_room">Media €/stanza in zona</option>
            </select>
          </label>

          <label className="mb-2 block text-[11px] text-slate-500">
            Raggio comparabili
            <select
              className="input-field mt-1 w-full py-1.5 text-xs"
              value={settings.radiusM}
              onChange={(e) => patch({ radiusM: Number(e.target.value) })}
            >
              {PROFIT_RADIUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-slate-500">
              Tasso mutuo %
              <input
                type="number"
                min={0}
                max={20}
                step={0.1}
                className="input-field mt-1 w-full py-1.5 text-xs"
                value={settings.mortgageRatePct}
                onChange={(e) => patch({ mortgageRatePct: Number(e.target.value) })}
              />
            </label>
            <label className="block text-[11px] text-slate-500">
              Anni mutuo
              <input
                type="number"
                min={1}
                max={40}
                step={1}
                className="input-field mt-1 w-full py-1.5 text-xs"
                value={settings.loanYears}
                onChange={(e) => patch({ loanYears: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="mb-2 block text-[11px] text-slate-500">
            Anticipo %
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className="input-field mt-1 w-full py-1.5 text-xs"
              value={settings.downPaymentPct}
              onChange={(e) => patch({ downPaymentPct: Number(e.target.value) })}
            />
          </label>

          <label className="mb-3 block text-[11px] text-slate-500">
            Regime affitto
            <select
              className="input-field mt-1 w-full py-1.5 text-xs"
              value={settings.rentalMode}
              onChange={(e) =>
                patch({
                  rentalMode:
                    e.target.value === "medium_term_semester"
                      ? "medium_term_semester"
                      : "long_term",
                })
              }
            >
              <option value="long_term">Lungo termine</option>
              <option value="medium_term_semester">Medio termine</option>
            </select>
          </label>

          <button
            type="button"
            className="w-full rounded-md border border-surface-border py-1.5 text-[11px] text-slate-400 hover:text-slate-200"
            onClick={() => onChange(DEFAULT_LISTING_PROFIT_SETTINGS)}
          >
            Ripristina default
          </button>
        </div>
      )}
    </div>
  );
}
