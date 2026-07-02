"use client";

import {
  EMPTY_LISTINGS_FILTERS,
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
    <label className={cn("block min-w-[88px] flex-1", className)}>
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
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
      className="input-field !py-2 text-sm"
      placeholder={placeholder}
      value={value != null ? String(value) : ""}
      onChange={(e) => onChange(parseFilterNumber(e.target.value))}
    />
  );
}

function PriceRange({
  label,
  min,
  max,
  placeholders,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: number | null;
  max: number | null;
  placeholders: [string, string];
  onMinChange: (value: number | null) => void;
  onMaxChange: (value: number | null) => void;
}) {
  return (
    <div className="flex min-w-[180px] flex-[2] gap-2">
      <FilterField label={`${label} min`}>
        <NumberInput value={min} placeholder={placeholders[0]} onChange={onMinChange} />
      </FilterField>
      <FilterField label={`${label} max`}>
        <NumberInput value={max} placeholder={placeholders[1]} onChange={onMaxChange} />
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
    <div className="mt-3 rounded-xl border border-surface-border/80 bg-surface-raised/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Filtri</p>
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
      <div className="flex flex-wrap gap-2">
        {showSalePrice && (
          <PriceRange
            label="Prezzo €"
            min={filters.salePriceMin}
            max={filters.salePriceMax}
            placeholders={["Min", "100k"]}
            onMinChange={(salePriceMin) => onChange({ ...filters, salePriceMin })}
            onMaxChange={(salePriceMax) => onChange({ ...filters, salePriceMax })}
          />
        )}
        {showRentPrice && (
          <PriceRange
            label="Affitto €/mese"
            min={filters.rentPriceMin}
            max={filters.rentPriceMax}
            placeholders={["Min", "Max"]}
            onMinChange={(rentPriceMin) => onChange({ ...filters, rentPriceMin })}
            onMaxChange={(rentPriceMax) => onChange({ ...filters, rentPriceMax })}
          />
        )}
        <div className="flex min-w-[140px] flex-[2] gap-2">
          <FilterField label="m² min">
            <NumberInput
              value={filters.sqmMin}
              placeholder="Min"
              onChange={(sqmMin) => onChange({ ...filters, sqmMin })}
            />
          </FilterField>
          <FilterField label="m² max">
            <NumberInput
              value={filters.sqmMax}
              placeholder="100"
              onChange={(sqmMax) => onChange({ ...filters, sqmMax })}
            />
          </FilterField>
        </div>
        <FilterField label="Locali" className="min-w-[88px] max-w-[120px]">
          <select
            className="select-field !py-2 text-sm"
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
        <FilterField label="Tipologia" className="min-w-[140px] flex-[1.5]">
          <select
            className="select-field !py-2 text-sm"
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
          <FilterField label="Stato" className="min-w-[140px] flex-[1.5]">
            <select
              className="select-field !py-2 text-sm"
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
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-surface-border/60 pt-3">
        <FilterField label="Zona" className="min-w-[140px] max-w-[180px]">
          <select
            className="select-field !py-2 text-sm"
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
        {filters.areaPreset === "custom" && (
          <FilterField label={`Raggio (${formatDistance(filters.areaRadiusM ?? 2500)})`} className="min-w-[160px] flex-[2]">
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
        )}
        {filters.areaPreset !== "off" && (
          <p className="pb-2 text-[11px] leading-relaxed text-slate-500">
            Cerchio sulla mappa — clicca per spostare il centro
            {filters.areaPreset === "centro" && " · 1 km"}
            {filters.areaPreset === "quartiere" && " · 2,5 km"}
          </p>
        )}
      </div>
    </div>
  );
}
