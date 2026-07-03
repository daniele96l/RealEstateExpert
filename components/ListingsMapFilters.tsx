"use client";

import {
  PROPERTY_TYPE_OPTIONS,
  CONDITION_FILTER_OPTIONS,
  ROOMS_OPTIONS,
  hasActiveFilters,
  parseFilterNumber,
  type AreaFilterPreset,
  type ConditionFilter,
  type ListingsFilters,
} from "@/lib/listings-filters";
import { formatDistance } from "@/lib/geo-filter";
import { cn } from "@/lib/utils";

type ViewMode = "sale" | "rent" | "both";

interface Props {
  viewMode: ViewMode;
  filters: ListingsFilters;
  onChange: (filters: ListingsFilters) => void;
  onReset: () => void;
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      {children}
    </section>
  );
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[10px] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className="input-field w-full !py-2 text-sm"
      placeholder={placeholder}
      value={value != null ? String(value) : ""}
      onChange={(e) => onChange(parseFilterNumber(e.target.value))}
    />
  );
}

function MinMaxRow({
  label,
  min,
  max,
  minPlaceholder,
  maxPlaceholder,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: number | null;
  max: number | null;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  onMinChange: (value: number | null) => void;
  onMaxChange: (value: number | null) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
      <FilterField label={`${label} · min`}>
        <NumberInput value={min} placeholder={minPlaceholder ?? "Min"} onChange={onMinChange} />
      </FilterField>
      <span className="pb-2.5 text-slate-600" aria-hidden>
        —
      </span>
      <FilterField label={`${label} · max`}>
        <NumberInput value={max} placeholder={maxPlaceholder ?? "Max"} onChange={onMaxChange} />
      </FilterField>
    </div>
  );
}

export default function ListingsMapFilters({ viewMode, filters, onChange, onReset }: Props) {
  const showSalePrice = viewMode === "sale" || viewMode === "both";
  const showRentPrice = viewMode === "rent" || viewMode === "both";
  const showRenovationFilter = viewMode === "sale" || viewMode === "both";
  const active = hasActiveFilters(filters);

  return (
    <div className="mt-3 rounded-xl border border-surface-border/80 bg-surface-raised/30 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-surface-border/50 pb-2">
        <p className="text-xs font-semibold text-slate-300">Filtri annunci</p>
        {active && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-accent hover:text-accent/80"
          >
            Reimposta
          </button>
        )}
      </div>

      <div className="space-y-4">
        {(showSalePrice || showRentPrice) && (
          <Section title="Prezzo">
            <div className="grid gap-3 lg:grid-cols-2">
              {showSalePrice && (
                <MinMaxRow
                  label="Vendita €"
                  min={filters.salePriceMin}
                  max={filters.salePriceMax}
                  minPlaceholder="Min"
                  maxPlaceholder="100k"
                  onMinChange={(salePriceMin) => onChange({ ...filters, salePriceMin })}
                  onMaxChange={(salePriceMax) => onChange({ ...filters, salePriceMax })}
                />
              )}
              {showRentPrice && (
                <MinMaxRow
                  label="Affitto €/mese"
                  min={filters.rentPriceMin}
                  max={filters.rentPriceMax}
                  onMinChange={(rentPriceMin) => onChange({ ...filters, rentPriceMin })}
                  onMaxChange={(rentPriceMax) => onChange({ ...filters, rentPriceMax })}
                />
              )}
            </div>
          </Section>
        )}

        <Section title="Immobile">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <MinMaxRow
                label="Superficie m²"
                min={filters.sqmMin}
                max={filters.sqmMax}
                maxPlaceholder="100"
                onMinChange={(sqmMin) => onChange({ ...filters, sqmMin })}
                onMaxChange={(sqmMax) => onChange({ ...filters, sqmMax })}
              />
            </div>
            <FilterField label="Locali">
              <select
                className="select-field w-full !py-2 text-sm"
                value={filters.rooms ?? ""}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    rooms: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Tutti</option>
                {ROOMS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Tipologia">
              <select
                className="select-field w-full !py-2 text-sm"
                value={filters.propertyType ?? ""}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    propertyType: e.target.value || null,
                  })
                }
              >
                <option value="">Tutte</option>
                {PROPERTY_TYPE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            {showRenovationFilter && (
              <FilterField label="Stato" className="sm:col-span-2 lg:col-span-1">
                <select
                  className="select-field w-full !py-2 text-sm"
                  value={filters.condition}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      condition: e.target.value as ConditionFilter,
                    })
                  }
                >
                  {CONDITION_FILTER_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FilterField>
            )}
          </div>
        </Section>

        <Section title="Zona sulla mappa">
          <div className="grid gap-3 sm:grid-cols-[minmax(140px,200px)_1fr] sm:items-end">
            <FilterField label="Area">
              <select
                className="select-field w-full !py-2 text-sm"
                value={filters.areaPreset}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    areaPreset: e.target.value as AreaFilterPreset,
                    areaLat: null,
                    areaLng: null,
                  })
                }
              >
                <option value="off">Tutta la città</option>
                <option value="centro">Centro (1 km)</option>
                <option value="quartiere">Quartiere (2,5 km)</option>
                <option value="custom">Personalizzata</option>
              </select>
            </FilterField>
            {filters.areaPreset === "custom" ? (
              <FilterField label={`Raggio · ${formatDistance(filters.areaRadiusM ?? 2500)}`}>
                <input
                  type="range"
                  min={300}
                  max={8000}
                  step={100}
                  value={filters.areaRadiusM ?? 2500}
                  onChange={(e) =>
                    onChange({ ...filters, areaRadiusM: Number(e.target.value) })
                  }
                  className="w-full accent-accent"
                />
              </FilterField>
            ) : filters.areaPreset !== "off" ? (
              <p className="pb-2 text-[11px] leading-relaxed text-slate-500">
                Cerchio sulla mappa — clicca per spostare il centro
                {filters.areaPreset === "centro" && " · raggio 1 km"}
                {filters.areaPreset === "quartiere" && " · raggio 2,5 km"}
              </p>
            ) : (
              <p className="pb-2 text-[11px] text-slate-600">
                Nessun filtro geografico — mostra tutti gli annunci in città
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
