"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  EMPTY_LISTING_PROFIT_FILTERS,
  hasActiveListingProfitFilters,
  type ListingProfitFilters,
  type ListingProfitSort,
} from "@/lib/listing-profit-filters";
import { parseFilterNumber } from "@/lib/listings-filters";
import { cn } from "@/lib/utils";

interface Props {
  filters: ListingProfitFilters;
  onChange: (filters: ListingProfitFilters) => void;
}

const SORT_OPTIONS: { value: ListingProfitSort; label: string }[] = [
  { value: "profit_desc", label: "Utile ↓ (migliori)" },
  { value: "profit_asc", label: "Utile ↑ (peggiori)" },
  { value: "price_asc", label: "Prezzo ↑" },
  { value: "price_desc", label: "Prezzo ↓" },
  { value: "default", label: "Ordine mappa" },
];

export default function ListingProfitFiltersPanel({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = hasActiveListingProfitFilters(filters);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const patch = (partial: Partial<ListingProfitFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded-md p-1.5 text-slate-400 transition-colors hover:bg-surface-raised hover:text-slate-200",
          open && "bg-surface-raised text-accent",
          active && !open && "text-accent",
        )}
        aria-label="Filtri utile"
        title="Filtri utile"
      >
        <SlidersHorizontal size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[min(280px,calc(100vw-2rem))] rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Filtri utile
            </p>
            {active && (
              <button
                type="button"
                className="text-[10px] font-medium text-accent hover:text-accent/80"
                onClick={() => onChange(EMPTY_LISTING_PROFIT_FILTERS)}
              >
                Reimposta
              </button>
            )}
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-slate-500">
              Utile min €/mese
              <input
                type="text"
                inputMode="decimal"
                className="input-field mt-1 w-full py-1.5 text-xs"
                placeholder="es. 0"
                value={filters.monthlyMin != null ? String(filters.monthlyMin) : ""}
                onChange={(e) => patch({ monthlyMin: parseFilterNumber(e.target.value) })}
              />
            </label>
            <label className="block text-[11px] text-slate-500">
              Utile max €/mese
              <input
                type="text"
                inputMode="decimal"
                className="input-field mt-1 w-full py-1.5 text-xs"
                placeholder="es. 500"
                value={filters.monthlyMax != null ? String(filters.monthlyMax) : ""}
                onChange={(e) => patch({ monthlyMax: parseFilterNumber(e.target.value) })}
              />
            </label>
          </div>

          <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              className="accent-accent"
              checked={filters.onlyPositive}
              onChange={(e) => patch({ onlyPositive: e.target.checked })}
            />
            Solo utile positivo
          </label>

          <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              className="accent-accent"
              checked={filters.hideWithoutEstimate}
              onChange={(e) => patch({ hideWithoutEstimate: e.target.checked })}
            />
            Nascondi senza stima
          </label>

          <label className="mb-1 block text-[11px] text-slate-500">
            Ordina per
            <select
              className="input-field mt-1 w-full py-1.5 text-xs"
              value={filters.sortBy}
              onChange={(e) => patch({ sortBy: e.target.value as ListingProfitSort })}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
