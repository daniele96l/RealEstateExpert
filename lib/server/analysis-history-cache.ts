import path from "path";
import type { AnalysisHistoryStore } from "@/lib/analysis-history";
import { normalizeHistoryStore } from "@/lib/analysis-history";
import { readJsonFile, writeJsonFile } from "./fs-cache-io";

const HISTORY_PATH = path.join(process.cwd(), "data/analyses/history.json");

export async function getAnalysisHistory(): Promise<AnalysisHistoryStore> {
  const data = await readJsonFile<AnalysisHistoryStore>(HISTORY_PATH);
  return normalizeHistoryStore(data ?? { version: 1, items: [] });
}

export async function saveAnalysisHistory(store: AnalysisHistoryStore): Promise<void> {
  await writeJsonFile(HISTORY_PATH, normalizeHistoryStore(store));
}

export function analysisHistoryCachePath(): string {
  return HISTORY_PATH;
}
