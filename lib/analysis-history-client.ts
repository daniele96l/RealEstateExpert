import {
  analysisHistoryFileLabel,
  createSavedComparison,
  normalizeHistoryStore,
  parseImportedComparisons,
  prependComparison,
  type AnalysisHistoryStore,
  type SavedAnalysisComparison,
} from "./analysis-history";
import type { SimpleScenario } from "./defaults";
import type { ListingAnalysisSource } from "./listing-analysis";

const STORAGE_KEY = "realestate_analysis_history";

export { analysisHistoryFileLabel };

export function readLocalAnalysisHistory(): AnalysisHistoryStore {
  if (typeof window === "undefined") return { version: 1, items: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, items: [] };
    return normalizeHistoryStore(JSON.parse(raw));
  } catch {
    return { version: 1, items: [] };
  }
}

export function writeLocalAnalysisHistory(store: AnalysisHistoryStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded */
  }
}

export function saveAnalysisComparison(
  source: ListingAnalysisSource,
  scenario: SimpleScenario,
  city?: string,
  market: import("./markets").MarketId = "it",
): SavedAnalysisComparison {
  const item = createSavedComparison(source, scenario, city, market);
  const next = prependComparison(readLocalAnalysisHistory(), item);
  writeLocalAnalysisHistory(next);
  void syncAnalysisHistoryToServer(next);
  return item;
}

export function mergeImportedComparisons(items: SavedAnalysisComparison[]): AnalysisHistoryStore {
  let store = readLocalAnalysisHistory();
  for (const item of [...items].reverse()) {
    store = prependComparison(store, item);
  }
  writeLocalAnalysisHistory(store);
  void syncAnalysisHistoryToServer(store);
  return store;
}

export function downloadAnalysisJson(
  data: SavedAnalysisComparison | AnalysisHistoryStore,
  filename?: string,
): void {
  const isStore = "items" in data;
  const name =
    filename ??
    (isStore
      ? "analisi_cronologia.json"
      : `analisi_${data.source.sale.id}_${data.savedAt.slice(0, 10)}.json`);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function syncAnalysisHistoryToServer(store: AnalysisHistoryStore): Promise<void> {
  try {
    await fetch("/api/analyses/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store),
    });
  } catch {
    /* server cache optional in production */
  }
}

export async function loadAnalysisHistoryCacheFirst(): Promise<{
  data: AnalysisHistoryStore;
  source: "local" | "server";
}> {
  const local = readLocalAnalysisHistory();
  if (local.items.length > 0) {
    return { data: local, source: "local" };
  }
  try {
    const res = await fetch("/api/analyses/history");
    if (!res.ok) return { data: local, source: "local" };
    const server = normalizeHistoryStore(await res.json());
    if (server.items.length > 0) {
      writeLocalAnalysisHistory(server);
      return { data: server, source: "server" };
    }
  } catch {
    /* ignore */
  }
  return { data: local, source: "local" };
}

export function importAnalysisJsonFile(file: File): Promise<SavedAnalysisComparison[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const items = parseImportedComparisons(parsed);
        if (!items.length) {
          reject(new Error("Nessun confronto valido nel file JSON"));
          return;
        }
        resolve(items);
      } catch {
        reject(new Error("File JSON non valido"));
      }
    };
    reader.onerror = () => reject(new Error("Lettura file fallita"));
    reader.readAsText(file);
  });
}
