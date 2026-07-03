export interface BatchFetchPageProgress {
  operation: "sale" | "rent";
  page: number;
  maxPages: number;
  listingsTotal: number;
}

export type BatchFetchProgressCallback = (progress: BatchFetchPageProgress) => void;

export interface BatchFetchProgressState {
  current: number;
  total: number;
  operation: "sale" | "rent" | null;
  page: number;
  maxPages: number;
  listingsTotal: number;
  label: string;
}

export interface BatchFetchStreamProgressEvent {
  type: "progress";
  current: number;
  total: number;
  operation: "sale" | "rent";
  page: number;
  maxPages: number;
  listingsTotal: number;
  label: string;
}

export interface BatchFetchStreamDoneEvent {
  type: "done";
  result: import("./types").BatchPreviewResult;
}

export interface BatchFetchStreamErrorEvent {
  type: "error";
  message: string;
}

export type BatchFetchStreamEvent =
  | BatchFetchStreamProgressEvent
  | BatchFetchStreamDoneEvent
  | BatchFetchStreamErrorEvent;

export function batchFetchProgressLabel(
  operation: "sale" | "rent",
  page: number,
  maxPages: number,
  market: import("./markets").MarketId = "it",
): string {
  const op =
    market === "cz"
      ? operation === "sale"
        ? "Prodej"
        : "Pronájem"
      : operation === "sale"
        ? "Vendita"
        : "Affitto";
  return `${op} · pag. ${page}/${maxPages}`;
}

export function batchFetchProgressPercent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}
