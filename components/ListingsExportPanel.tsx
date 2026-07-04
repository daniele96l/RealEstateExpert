"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildListingsExport,
  persistListingsExport,
  resolveExportSaleListings,
  type ListingsExportContext,
  type ExportProgress,
} from "@/lib/listings-export";
import {
  emptyListingsFilters,
  filterSelectOptions,
  salePricePresetsForMarket,
  SQM_PRESETS,
  type ListingsFilters,
} from "@/lib/listings-filters";
import { CZ_ROOM_LAYOUT_OPTIONS } from "@/lib/czech-room-layout";
import type { MarketId } from "@/lib/markets";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { ChevronDown, Download, Loader2 } from "lucide-react";

interface Props {
  market: MarketId;
  context: ListingsExportContext | null;
  onExportComplete?: () => void;
}

export default function ListingsExportPanel({ market, context, onExportComplete }: Props) {
  const { t } = useI18n();
  const currency = market === "cz" ? "Kč" : "€";

  const [showOptions, setShowOptions] = useState(false);
  const [useMapFilters, setUseMapFilters] = useState(true);
  const [applyMapBounds, setApplyMapBounds] = useState(true);
  const [includeProfitPreview, setIncludeProfitPreview] = useState(true);
  const [customFilters, setCustomFilters] = useState<ListingsFilters>(() =>
    emptyListingsFilters(market),
  );
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [lastResult, setLastResult] = useState<{
    count: number;
    errors: number;
    savedPath: string | null;
    detailsCached: number;
    cityListingsUpdated: boolean;
  } | null>(null);

  useEffect(() => {
    setCustomFilters(emptyListingsFilters(market));
  }, [market]);

  const exportOptions = useMemo(
    () => ({
      useMapFilters,
      filters: customFilters,
      applyMapBounds,
      includeProfitPreview,
      fetchMissingDetails: true,
    }),
    [useMapFilters, customFilters, applyMapBounds, includeProfitPreview],
  );

  const previewCount = useMemo(() => {
    if (!context?.hasData) return 0;
    return resolveExportSaleListings(context, exportOptions).length;
  }, [context, exportOptions]);

  const statusLine = useMemo(() => {
    if (exporting && progress) {
      return progress.total > 0
        ? `${t("export.exporting")} (${t("export.progress", { current: progress.current, total: progress.total })})`
        : t("export.exporting");
    }
    if (lastResult && !exporting) {
      if (lastResult.errors === -1) return t("export.failed");
      return `${t("export.done", { count: lastResult.count })}${lastResult.errors > 0 ? ` · ${t("export.errors", { count: lastResult.errors })}` : ""}`;
    }
    if (!context?.hasData) return t("export.noData");
    if (previewCount === 0) return t("export.noneMatch");
    return t("export.ready", { count: previewCount, city: context.city });
  }, [context, exporting, lastResult, previewCount, progress, t]);

  const handleExport = useCallback(async () => {
    if (!context?.hasData || previewCount === 0 || exporting) return;
    setExporting(true);
    setLastResult(null);
    setProgress(null);
    try {
      const bundle = await buildListingsExport(context, exportOptions, setProgress);
      const result = await persistListingsExport(bundle, context);
      setLastResult({
        count: bundle.count,
        errors: bundle.fetch_stats.fetch_errors,
        savedPath: result.savedPath,
        detailsCached: result.detailsCached,
        cityListingsUpdated: result.cityListingsUpdated,
      });
      onExportComplete?.();
    } catch {
      setLastResult({ count: 0, errors: -1, savedPath: null, detailsCached: 0, cityListingsUpdated: false });
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }, [context, exportOptions, previewCount, exporting, onExportComplete]);

  const salePresets = salePricePresetsForMarket(market);

  return (
    <section className="card-glass relative z-0 overflow-hidden">
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Download size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-100">{t("export.title")}</h2>
            <p
              className={cn(
                "text-xs leading-snug",
                exporting ? "text-accent" : lastResult?.errors === -1 ? "text-amber-400" : lastResult && !exporting ? "text-emerald-400" : "text-slate-500",
              )}
            >
              {exporting && <Loader2 size={12} className="mr-1 inline animate-spin" />}
              {statusLine}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-slate-400 hover:bg-surface-raised hover:text-slate-200"
            aria-expanded={showOptions}
          >
            {showOptions ? t("export.hideOptions") : t("export.options")}
            <ChevronDown size={14} className={cn("transition-transform", showOptions && "rotate-180")} />
          </button>
          <button
            type="button"
            disabled={!context?.hasData || previewCount === 0 || exporting}
            onClick={() => void handleExport()}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              "bg-accent text-surface-base hover:bg-accent/90",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {t("export.button")}
          </button>
        </div>
      </div>

      {showOptions && (
        <div className="space-y-3 border-t border-surface-border/60 px-4 py-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                className="rounded border-surface-border"
                checked={useMapFilters}
                onChange={(e) => setUseMapFilters(e.target.checked)}
              />
              {t("export.useMapFilters")}
            </label>
            {useMapFilters && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
                <input
                  type="checkbox"
                  className="rounded border-surface-border"
                  checked={applyMapBounds}
                  onChange={(e) => setApplyMapBounds(e.target.checked)}
                />
                {t("export.applyMapBounds")}
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                className="rounded border-surface-border"
                checked={includeProfitPreview}
                onChange={(e) => setIncludeProfitPreview(e.target.checked)}
              />
              {t("export.includeProfit")}
            </label>
          </div>

          <p className="text-[11px] leading-snug text-slate-500">{t("export.fetchAlways")}</p>

          {!useMapFilters && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-[11px] text-slate-400">
                {t("export.priceMin", { currency })}
                <select
                  className="select-field mt-0.5 w-full py-1 text-xs"
                  value={customFilters.salePriceMin ?? ""}
                  onChange={(e) =>
                    setCustomFilters((f) => ({
                      ...f,
                      salePriceMin: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">—</option>
                  {filterSelectOptions(salePresets, customFilters.salePriceMin).map((v) => (
                    <option key={v} value={v}>
                      {v.toLocaleString(market === "cz" ? "cs-CZ" : "it-IT")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-slate-400">
                {t("export.priceMax", { currency })}
                <select
                  className="select-field mt-0.5 w-full py-1 text-xs"
                  value={customFilters.salePriceMax ?? ""}
                  onChange={(e) =>
                    setCustomFilters((f) => ({
                      ...f,
                      salePriceMax: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">—</option>
                  {filterSelectOptions(salePresets, customFilters.salePriceMax).map((v) => (
                    <option key={v} value={v}>
                      {v.toLocaleString(market === "cz" ? "cs-CZ" : "it-IT")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-slate-400">
                {t("export.sqmMin")}
                <select
                  className="select-field mt-0.5 w-full py-1 text-xs"
                  value={customFilters.sqmMin ?? ""}
                  onChange={(e) =>
                    setCustomFilters((f) => ({
                      ...f,
                      sqmMin: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">—</option>
                  {filterSelectOptions(SQM_PRESETS, customFilters.sqmMin).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-slate-400">
                {t("export.sqmMax")}
                <select
                  className="select-field mt-0.5 w-full py-1 text-xs"
                  value={customFilters.sqmMax ?? ""}
                  onChange={(e) =>
                    setCustomFilters((f) => ({
                      ...f,
                      sqmMax: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">—</option>
                  {filterSelectOptions(SQM_PRESETS, customFilters.sqmMax).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {market === "cz" && (
                <label className="block text-[11px] text-slate-400 sm:col-span-2">
                  {t("export.roomLayout")}
                  <select
                    className="select-field mt-0.5 w-full py-1 text-xs"
                    value={customFilters.roomLayout ?? ""}
                    onChange={(e) =>
                      setCustomFilters((f) => ({
                        ...f,
                        roomLayout: e.target.value || null,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {CZ_ROOM_LAYOUT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
