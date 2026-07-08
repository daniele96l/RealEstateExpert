"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analysisHistoryFileLabel,
  downloadAnalysisJson,
  importAnalysisJsonFile,
  loadAnalysisHistoryCacheFirst,
  mergeImportedComparisons,
  readLocalAnalysisHistory,
  writeLocalAnalysisHistory,
} from "@/lib/analysis-history-client";
import { inferAnalysisMarket, type SavedAnalysisComparison } from "@/lib/analysis-history";
import { getMarket, type MarketId } from "@/lib/markets";
import { useI18n } from "@/lib/i18n/context";
import { cn, fmtMoney } from "@/lib/utils";
import { Clock, Download, FileUp, History, Trash2 } from "lucide-react";

interface Props {
  market: MarketId;
  onRestore: (item: SavedAnalysisComparison) => void;
  activeId?: string | null;
  refreshToken?: number;
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AnalysisHistoryPanel({
  market,
  onRestore,
  activeId = null,
  refreshToken = 0,
}: Props) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<SavedAnalysisComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const marketCfg = getMarket(market);
  const dateLocale = locale === "en" ? "en-GB" : marketCfg.locale;

  const visibleItems = useMemo(
    () => items.filter((item) => inferAnalysisMarket(item) === market),
    [items, market],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await loadAnalysisHistoryCacheFirst();
    setItems(data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  const handleRestore = (item: SavedAnalysisComparison) => {
    onRestore(item);
    document.getElementById("parametri")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = (id: string) => {
    const next = readLocalAnalysisHistory();
    next.items = next.items.filter((item) => item.id !== id);
    writeLocalAnalysisHistory(next);
    setItems(next.items);
  };

  const handleImport = async (file: File) => {
    const imported = await importAnalysisJsonFile(file);
    const store = mergeImportedComparisons(imported);
    setItems(store.items);
  };

  if (!loading && visibleItems.length === 0) {
    return (
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-neutral-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <History size={18} className="text-neutral-900" />
            <h2 className="font-semibold text-neutral-900">{t("history.title")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file).catch(() => {});
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
            >
              <FileUp size={14} />
              {t("common.importJson")}
            </button>
          </div>
        </div>
        <p className="px-5 py-6 text-sm text-neutral-500">
          {items.length > 0
            ? market === "cz"
              ? t("history.emptyCz")
              : t("history.emptyIt")
            : t("history.emptyAll", { file: analysisHistoryFileLabel() })}
        </p>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-neutral-50 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <History size={18} className="text-neutral-900" />
            <h2 className="font-semibold text-neutral-900">{t("history.title")}</h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {t("history.autoSave", { market: marketCfg.label, file: analysisHistoryFileLabel() })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file).catch(() => {});
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() =>
              downloadAnalysisJson(
                { version: 1, items: visibleItems },
                market === "cz" ? "analisi_cronologia_cz.json" : "analisi_cronologia_it.json",
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            <Download size={14} />
            {t("common.export")}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            <FileUp size={14} />
            {t("common.importJson")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-6 text-sm text-neutral-500">{t("history.loading")}</p>
      ) : (
        <ul className="divide-y divide-surface-border/60">
          {visibleItems.map((item) => {
            const selected = item.id === activeId;
            return (
            <li
              key={item.id}
              className={cn(
                "flex flex-wrap items-start gap-3 px-5 py-4 transition-colors",
                selected && "bg-neutral-100 ring-1 ring-inset ring-neutral-300",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-800 line-clamp-2">{item.label}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    {formatWhen(item.savedAt, dateLocale)}
                  </span>
                  {item.city && <span>{item.city}</span>}
                  <span>{fmtMoney(item.source.sale.price, market)}</span>
                  <span>{t("history.similarRents", { count: item.source.similarRentals.length })}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAnalysisJson(item)}
                  className="rounded-lg border border-surface-border p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                  title={t("common.exportJson")}
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="rounded-lg border border-surface-border p-2 text-neutral-600 hover:bg-red-500/10 hover:text-red-400"
                  title={t("common.delete")}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRestore(item)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium",
                    selected
                      ? "bg-accent text-white"
                      : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
                  )}
                >
                  {selected ? t("common.selected") : t("common.restore")}
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
