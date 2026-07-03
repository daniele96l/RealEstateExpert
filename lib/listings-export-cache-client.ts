import type { ListingsExportBundle } from "./listings-export";
import { listingsCacheSlug, type MarketId } from "./markets";

const INDEX_KEY = "realestate_listings_export_index";
const MAX_STORED_EXPORTS = 12;

export interface LocalExportIndexEntry {
  market: MarketId;
  city: string;
  exported_at: string;
  count: number;
  latestKey: string;
}

function latestExportKey(market: MarketId, city: string): string {
  return `realestate_listings_export_latest_${listingsCacheSlug(market, city)}`;
}

function historyExportKey(bundle: ListingsExportBundle): string {
  const slug = listingsCacheSlug(bundle.market, bundle.city);
  const stamp = bundle.exported_at.replace(/[:.]/g, "");
  return `realestate_listings_export_${slug}_${stamp}`;
}

function readIndex(): LocalExportIndexEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalExportIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: LocalExportIndexEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries.slice(0, MAX_STORED_EXPORTS)));
  } catch {
    /* quota */
  }
}

export function writeLocalListingsExportCache(bundle: ListingsExportBundle): string {
  if (typeof window === "undefined") return latestExportKey(bundle.market, bundle.city);

  const latestKey = latestExportKey(bundle.market, bundle.city);
  const historyKey = historyExportKey(bundle);
  const payload = JSON.stringify(bundle);

  try {
    localStorage.setItem(latestKey, payload);
    localStorage.setItem(historyKey, payload);

    const slug = listingsCacheSlug(bundle.market, bundle.city);
    const entry: LocalExportIndexEntry = {
      market: bundle.market,
      city: slug,
      exported_at: bundle.exported_at,
      count: bundle.count,
      latestKey,
    };

    const index = readIndex().filter(
      (item) => !(item.market === bundle.market && item.city === slug),
    );
    writeIndex([entry, ...index]);
  } catch {
    /* quota exceeded — download + server JSON still available */
  }

  return latestKey;
}

export function readLatestLocalListingsExport(
  market: MarketId,
  city: string,
): ListingsExportBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(latestExportKey(market, city));
    if (!raw) return null;
    return JSON.parse(raw) as ListingsExportBundle;
  } catch {
    return null;
  }
}

export function listLocalListingsExportIndex(): LocalExportIndexEntry[] {
  return readIndex();
}
