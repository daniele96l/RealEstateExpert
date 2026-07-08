"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import {
  EMPTY_LISTING_PROFIT_FILTERS,
  hasActiveListingProfitFilters,
  type ListingProfitFilters,
  type ListingProfitSort,
} from "@/lib/listing-profit-filters";
import {
  DEFAULT_LISTING_PROFIT_SETTINGS,
  PROFIT_RADIUS_OPTIONS,
  type ListingProfitSettings,
} from "@/lib/listing-profit-settings";
import { parseFilterNumber } from "@/lib/listings-filters";
import { cn } from "@/lib/utils";

interface Props {
  filters: ListingProfitFilters;
  settings: ListingProfitSettings;
  onFiltersChange: (filters: ListingProfitFilters) => void;
  onSettingsChange: (settings: ListingProfitSettings) => void;
}

const SORT_OPTIONS: { value: ListingProfitSort; label: string }[] = [
  { value: "profit_desc", label: "Utile ↓ (migliori)" },
  { value: "profit_asc", label: "Utile ↑ (peggiori)" },
  { value: "price_asc", label: "Prezzo ↑" },
  { value: "price_desc", label: "Prezzo ↓" },
  { value: "default", label: "Ordine mappa" },
];

function hasCustomSettings(settings: ListingProfitSettings): boolean {
  return (
    settings.rentMethod !== DEFAULT_LISTING_PROFIT_SETTINGS.rentMethod ||
    settings.radiusM !== DEFAULT_LISTING_PROFIT_SETTINGS.radiusM ||
    settings.mortgageRatePct !== DEFAULT_LISTING_PROFIT_SETTINGS.mortgageRatePct ||
    settings.loanYears !== DEFAULT_LISTING_PROFIT_SETTINGS.loanYears ||
    settings.downPaymentPct !== DEFAULT_LISTING_PROFIT_SETTINGS.downPaymentPct ||
    settings.rentalMode !== DEFAULT_LISTING_PROFIT_SETTINGS.rentalMode
  );
}

export default function ListingProfitPanel({
  filters,
  settings,
  onFiltersChange,
  onSettingsChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const filtersActive = hasActiveListingProfitFilters(filters);
  const settingsActive = hasCustomSettings(settings);
  const active = filtersActive || settingsActive;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuStyle(null);
      return;
    }
    const update = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setMenuStyle({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const patchFilters = (partial: Partial<ListingProfitFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const patchSettings = (partial: Partial<ListingProfitSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded-md p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800",
          open && "bg-white text-neutral-900",
          active && !open && "text-neutral-900",
        )}
        aria-label="Utile: calcolo e filtri"
        title="Utile: calcolo e filtri"
      >
        <SlidersHorizontal size={16} />
      </button>

      {open &&
        menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: menuStyle.top, right: menuStyle.right }}
            className="fixed z-[1100] max-h-[min(70vh,520px)] w-[min(300px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-surface-border bg-white p-3 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Calcolo utile
              </p>
              {settingsActive && (
                <button
                  type="button"
                  className="text-[10px] font-medium text-neutral-900 hover:text-neutral-900/80"
                  onClick={() => onSettingsChange(DEFAULT_LISTING_PROFIT_SETTINGS)}
                >
                  Reimposta calcolo
                </button>
              )}
            </div>

            <label className="mb-2 block text-[11px] text-neutral-500">
              Affitto stimato da vicini
              <select
                className="input-field mt-1 w-full py-1.5 text-xs"
                value={settings.rentMethod}
                onChange={(e) =>
                  patchSettings({
                    rentMethod: e.target.value === "per_room" ? "per_room" : "per_sqm",
                  })
                }
              >
                <option value="per_sqm">Media €/m² in zona</option>
                <option value="per_room">Media €/stanza in zona</option>
              </select>
            </label>

            <label className="mb-2 block text-[11px] text-neutral-500">
              Raggio comparabili
              <select
                className="input-field mt-1 w-full py-1.5 text-xs"
                value={settings.radiusM}
                onChange={(e) => patchSettings({ radiusM: Number(e.target.value) })}
              >
                {PROFIT_RADIUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="block text-[11px] text-neutral-500">
                Tasso mutuo %
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  className="input-field mt-1 w-full py-1.5 text-xs"
                  value={settings.mortgageRatePct}
                  onChange={(e) => patchSettings({ mortgageRatePct: Number(e.target.value) })}
                />
              </label>
              <label className="block text-[11px] text-neutral-500">
                Anni mutuo
                <input
                  type="number"
                  min={1}
                  max={40}
                  step={1}
                  className="input-field mt-1 w-full py-1.5 text-xs"
                  value={settings.loanYears}
                  onChange={(e) => patchSettings({ loanYears: Number(e.target.value) })}
                />
              </label>
            </div>

            <label className="mb-2 block text-[11px] text-neutral-500">
              Anticipo %
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="input-field mt-1 w-full py-1.5 text-xs"
                value={settings.downPaymentPct}
                onChange={(e) => patchSettings({ downPaymentPct: Number(e.target.value) })}
              />
            </label>

            <label className="mb-3 block text-[11px] text-neutral-500">
              Regime affitto
              <select
                className="input-field mt-1 w-full py-1.5 text-xs"
                value={settings.rentalMode}
                onChange={(e) =>
                  patchSettings({
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

            <div className="mb-3 border-t border-surface-border/60 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Filtri
                </p>
                {filtersActive && (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-neutral-900 hover:text-neutral-900/80"
                    onClick={() => onFiltersChange(EMPTY_LISTING_PROFIT_FILTERS)}
                  >
                    Reimposta filtri
                  </button>
                )}
              </div>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-neutral-500">
                  Utile min €/mese
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-field mt-1 w-full py-1.5 text-xs"
                    placeholder="es. 0"
                    value={filters.monthlyMin != null ? String(filters.monthlyMin) : ""}
                    onChange={(e) => patchFilters({ monthlyMin: parseFilterNumber(e.target.value) })}
                  />
                </label>
                <label className="block text-[11px] text-neutral-500">
                  Utile max €/mese
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-field mt-1 w-full py-1.5 text-xs"
                    placeholder="es. 500"
                    value={filters.monthlyMax != null ? String(filters.monthlyMax) : ""}
                    onChange={(e) => patchFilters({ monthlyMax: parseFilterNumber(e.target.value) })}
                  />
                </label>
              </div>

              <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-neutral-600">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={filters.onlyPositive}
                  onChange={(e) => patchFilters({ onlyPositive: e.target.checked })}
                />
                Solo utile positivo
              </label>

              <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-neutral-600">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={filters.hideWithoutEstimate}
                  onChange={(e) => patchFilters({ hideWithoutEstimate: e.target.checked })}
                />
                Nascondi senza stima
              </label>

              <label className="block text-[11px] text-neutral-500">
                Ordina per
                <select
                  className="input-field mt-1 w-full py-1.5 text-xs"
                  value={filters.sortBy}
                  onChange={(e) => patchFilters({ sortBy: e.target.value as ListingProfitSort })}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
