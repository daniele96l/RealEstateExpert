"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analysisHistoryFileLabel,
  downloadAnalysisJson,
  importAnalysisJsonFile,
  loadAnalysisHistoryCacheFirst,
  mergeImportedComparisons,
  readLocalAnalysisHistory,
  writeLocalAnalysisHistory,
} from "@/lib/analysis-history-client";
import type { SavedAnalysisComparison } from "@/lib/analysis-history";
import type { ListingAnalysisSource } from "@/lib/listing-analysis";
import type { SimpleScenario } from "@/lib/defaults";
import { fmtEuro } from "@/lib/utils";
import { Clock, Download, FileUp, History, Trash2 } from "lucide-react";

interface Props {
  onRestore: (source: ListingAnalysisSource, scenario: SimpleScenario) => void;
  refreshToken?: number;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
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

export default function AnalysisHistoryPanel({ onRestore, refreshToken = 0 }: Props) {
  const [items, setItems] = useState<SavedAnalysisComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

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
    onRestore(item.source, item.scenario);
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

  if (!loading && items.length === 0) {
    return (
      <section className="card-glass overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
          <div className="flex items-center gap-2">
            <History size={18} className="text-accent" />
            <h2 className="font-semibold text-slate-100">Cronologia analisi</h2>
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-raised"
            >
              <FileUp size={14} />
              Importa JSON
            </button>
          </div>
        </div>
        <p className="px-5 py-6 text-sm text-slate-500">
          I confronti vendita/affitti simili vengono salvati automaticamente qui e in{" "}
          <code className="text-slate-400">{analysisHistoryFileLabel()}</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="card-glass overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <History size={18} className="text-accent" />
            <h2 className="font-semibold text-slate-100">Cronologia analisi</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Salvataggio automatico in browser e {analysisHistoryFileLabel()}
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
            onClick={() => downloadAnalysisJson(readLocalAnalysisHistory())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-raised"
          >
            <Download size={14} />
            Esporta tutto
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-raised"
          >
            <FileUp size={14} />
            Importa JSON
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-6 text-sm text-slate-500">Caricamento cronologia…</p>
      ) : (
        <ul className="divide-y divide-surface-border/60">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-200 line-clamp-2">{item.label}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    {formatWhen(item.savedAt)}
                  </span>
                  {item.city && <span>{item.city}</span>}
                  <span>{fmtEuro(item.source.sale.price)}</span>
                  <span>{item.source.similarRentals.length} affitti simili</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAnalysisJson(item)}
                  className="rounded-lg border border-surface-border p-2 text-slate-400 hover:bg-surface-raised hover:text-slate-200"
                  title="Esporta JSON"
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="rounded-lg border border-surface-border p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                  title="Elimina"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRestore(item)}
                  className="rounded-lg bg-accent/20 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/30"
                >
                  Ripristina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
