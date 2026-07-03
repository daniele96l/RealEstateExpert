import type { SimpleScenario } from "./defaults";
import type { ListingAnalysisSource } from "./listing-analysis";
import type { MarketId } from "./markets";
import { isMarketId } from "./markets";

export interface SavedAnalysisComparison {
  id: string;
  savedAt: string;
  label: string;
  city?: string;
  market?: MarketId;
  source: ListingAnalysisSource;
  scenario: SimpleScenario;
}

export interface AnalysisHistoryStore {
  version: 1;
  items: SavedAnalysisComparison[];
}

const STORE_VERSION = 1 as const;
const MAX_ITEMS = 50;

export function analysisHistoryFileLabel(): string {
  return "data/analyses/history.json";
}

export function buildComparisonLabel(source: ListingAnalysisSource): string {
  const zone = source.sale.zone?.trim();
  const rooms = source.sale.rooms != null ? `${source.sale.rooms} locali` : null;
  const parts = [zone, rooms].filter(Boolean);
  const suffix = parts.length ? ` — ${parts.join(", ")}` : "";
  return `${source.sale.title.slice(0, 80)}${suffix}`;
}

export function createSavedComparison(
  source: ListingAnalysisSource,
  scenario: SimpleScenario,
  city?: string,
  market: MarketId = "it",
): SavedAnalysisComparison {
  return {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    label: buildComparisonLabel(source),
    city,
    market,
    source,
    scenario,
  };
}

/** Infer market for legacy items saved before market tagging. */
export function inferAnalysisMarket(item: SavedAnalysisComparison): MarketId {
  if (isMarketId(item.market)) return item.market;
  const url = item.source.sale.url?.toLowerCase() ?? "";
  if (url.includes("sreality.cz")) return "cz";
  if (url.includes("idealista.") || url.includes("immobiliare.")) return "it";
  if (item.scenario.property_tax_annual > 0) return "cz";
  return "it";
}

function isListingAnalysisSource(value: unknown): value is ListingAnalysisSource {
  if (!value || typeof value !== "object") return false;
  const v = value as ListingAnalysisSource;
  return (
    v.sale != null &&
    typeof v.sale === "object" &&
    Array.isArray(v.similarRentals) &&
    typeof v.avgRentPerRoom === "number"
  );
}

function isSimpleScenario(value: unknown): value is SimpleScenario {
  if (!value || typeof value !== "object") return false;
  const v = value as SimpleScenario;
  return typeof v.purchase_price === "number" && typeof v.monthly_rent === "number";
}

export function isSavedAnalysisComparison(value: unknown): value is SavedAnalysisComparison {
  if (!value || typeof value !== "object") return false;
  const v = value as SavedAnalysisComparison;
  return (
    typeof v.id === "string" &&
    typeof v.savedAt === "string" &&
    typeof v.label === "string" &&
    isListingAnalysisSource(v.source) &&
    isSimpleScenario(v.scenario)
  );
}

export function normalizeHistoryStore(raw: unknown): AnalysisHistoryStore {
  if (!raw || typeof raw !== "object") {
    return { version: STORE_VERSION, items: [] };
  }
  const items = Array.isArray((raw as AnalysisHistoryStore).items)
    ? (raw as AnalysisHistoryStore).items.filter(isSavedAnalysisComparison)
    : [];
  return { version: STORE_VERSION, items: items.slice(0, MAX_ITEMS) };
}

export function prependComparison(
  store: AnalysisHistoryStore,
  item: SavedAnalysisComparison,
): AnalysisHistoryStore {
  const withoutDup = store.items.filter(
    (existing) =>
      existing.source.sale.id !== item.source.sale.id ||
      existing.savedAt !== item.savedAt,
  );
  return {
    version: STORE_VERSION,
    items: [item, ...withoutDup].slice(0, MAX_ITEMS),
  };
}

export function parseImportedComparisons(raw: unknown): SavedAnalysisComparison[] {
  if (Array.isArray(raw)) {
    return raw.filter(isSavedAnalysisComparison);
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as AnalysisHistoryStore).items)) {
    return normalizeHistoryStore(raw).items;
  }
  if (isSavedAnalysisComparison(raw)) {
    return [raw];
  }
  return [];
}
