"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildListingsExport,
  downloadListingsExport,
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
import { Download, Loader2 } from "lucide-react";

interface Props {
  market: MarketId;
  context: ListingsExportContext | null;
}

export default function ListingsExportPanel({ market, context }: Props) {
  const { t } = useI18n();
  const currency = market === "cz" ? "Kč" : "€";

  const [useMapFilters, setUseMapFilters] = useState(true);
  const [applyMapBounds, setApplyMapBounds] = useState(true);
  const [includeProfitPreview, setIncludeProfitPreview] = useState(true);
  const [fetchMissingDetails, setFetchMissingDetails] = useState(false);
  const [customFilters, setCustomFilters] = useState<ListingsFilters>(() =>
    emptyListingsFilters(market),
  );
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [lastResult, setLastResult] = useState<{ count: number; errors: number } | null>(null);

  useEffect(() => {
    setCustomFilters(emptyListingsFilters(market));
  }, [market]);

  const exportOptions = useMemo(
    () => ({
      useMapFilters,
      filters: customFilters,
      applyMapBounds,
      includeProfitPreview,
      fetchMissingDetails,
    }),
    [useMapFilters, customFilters, applyMapBounds, includeProfitPreview, fetchMissingDetails],
  );

  const previewCount = useMemo(() => {
    if (!context?.hasData) return 0;
    return resolveExportSaleListings(context, exportOptions).length;
  }, [context, exportOptions]);

  const handleExport = useCallback(async () => {
    if (!context?.hasData || previewCount === 0 || exporting) return;
    setExporting(true);
    setLastResult(null);
    setProgress(null);
    try {
      const bundle = await buildListingsExport(context, exportOptions, setProgress);
      downloadListingsExport(bundle);
      setLastResult({ count: bundle.count, errors: bundle.fetch_stats.fetch_errors });
    } catch {
      setLastResult({ count: 0, errors: -1 });
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }, [context, exportOptions, previewCount, exporting]);

  const salePresets = salePricePresetsForMarket(market);
  const title = market === "cz" ? "Export prodejních inzerátů" : t("export.title");
  const subtitle = market === "cz"
    ? "Stáhněte filtrované nabídky prodeje jako JSON s cenou, plochou, popisem a všemi dostupnými poli."
    : t("export.subtitle");

  return (
    <section className="card-glass overflow-hidden">
      <div className="border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
        <div className="flex items-center gap-2">
          <Download size={18} className="text-accent" />
          <h2 className="font-semibold text-slate-100">{title}</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="rounded border-surface-border"
              checked={useMapFilters}
              onChange={(e) => setUseMapFilters(e.target.checked)}
            />
            {market === "cz" ? "Použít filtry z mapy" : t("export.useMapFilters")}
          </label>
          {useMapFilters && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="rounded border-surface-border"
                checked={applyMapBounds}
                onChange={(e) => setApplyMapBounds(e.target.checked)}
              />
              {market === "cz" ? "Jen viditelné na mapě" : t("export.applyMapBounds")}
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="rounded border-surface-border"
              checked={includeProfitPreview}
              onChange={(e) => setIncludeProfitPreview(e.target.checked)}
            />
            {market === "cz" ? "Včetně odhadu zisku" : t("export.includeProfit")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="rounded border-surface-border"
              checked={fetchMissingDetails}
              onChange={(e) => setFetchMissingDetails(e.target.checked)}
            />
            {market === "cz" ? "Stáhnout chybějící popisy" : t("export.fetchMissing")}
          </label>
        </div>

        {fetchMissingDetails && (
          <p className="text-xs text-amber-400/90">
            {market === "cz"
              ? "U větších dávek to může trvat několik minut a spotřebuje API kredity."
              : t("export.fetchWarning")}
          </p>
        )}

        {!useMapFilters && (
          <div className="rounded-xl border border-surface-border/60 bg-surface-raised/30 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              {market === "cz" ? "Vlastní filtry" : t("export.customFilters")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs text-slate-400">
                {t("export.priceMin", { currency })}
                <select
                  className="select-field mt-1 w-full"
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
              <label className="block text-xs text-slate-400">
                {t("export.priceMax", { currency })}
                <select
                  className="select-field mt-1 w-full"
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
              <label className="block text-xs text-slate-400">
                {t("export.sqmMin")}
                <select
                  className="select-field mt-1 w-full"
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
              <label className="block text-xs text-slate-400">
                {t("export.sqmMax")}
                <select
                  className="select-field mt-1 w-full"
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
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  Dispozice
                  <select
                    className="select-field mt-1 w-full"
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
          </div>
        )}

        <p className="text-sm text-slate-400">
          {!context?.hasData
            ? market === "cz"
              ? "Nejdřív načtěte prodejní inzeráty na mapě."
              : t("export.noData")
            : previewCount === 0
              ? market === "cz"
                ? "Žádné inzeráty neodpovídají filtrům."
                : t("export.noneMatch")
              : market === "cz"
                ? `Připraveno exportovat ${previewCount} prodejních inzerátů z ${context.city}`
                : t("export.ready", { count: previewCount, city: context.city })}
        </p>

        {exporting && progress && (
          <p className="flex items-center gap-2 text-sm text-accent">
            <Loader2 size={16} className="animate-spin" />
            {market === "cz" ? "Exportuji…" : t("export.exporting")}{" "}
            {progress.total > 0 && (
              <span className="text-slate-500">
                ({t("export.progress", { current: progress.current, total: progress.total })})
              </span>
            )}
          </p>
        )}

        {lastResult && !exporting && (
          <p className={cn("text-sm", lastResult.errors > 0 ? "text-amber-400" : "text-emerald-400")}>
            {lastResult.errors === -1
              ? market === "cz"
                ? "Export se nezdařil."
                : "Export failed."
              : market === "cz"
                ? `Exportováno ${lastResult.count} inzerátů${lastResult.errors > 0 ? ` · ${lastResult.errors} se nepodařilo načíst` : ""}`
                : `${t("export.done", { count: lastResult.count })}${lastResult.errors > 0 ? ` · ${t("export.errors", { count: lastResult.errors })}` : ""}`}
          </p>
        )}

        <button
          type="button"
          disabled={!context?.hasData || previewCount === 0 || exporting}
          onClick={() => void handleExport()}
          className={cn(
            "flex w-full items-center justify-center gap-3 rounded-xl px-6 py-5 text-lg font-semibold transition-colors",
            "bg-accent text-surface-base hover:bg-accent/90",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {exporting ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <Download size={22} />
          )}
          {market === "cz" ? "Exportovat JSON" : t("export.button")}
        </button>
      </div>
    </section>
  );
}
