export interface OccupancySnapshotProgressState {
  current: number;
  total: number;
  page: number;
  maxPages: number;
  listingsTotal: number;
  label: string;
}

export interface OccupancySnapshotStreamProgressEvent {
  type: "progress";
  current: number;
  total: number;
  page: number;
  maxPages: number;
  listingsTotal: number;
  label: string;
}

export interface OccupancySnapshotStreamDoneEvent {
  type: "done";
  result: {
    metrics: import("./types").OccupancyCityMetrics;
    listings_preview: import("./types").OccupancyListingsPreview | null;
    fetched_count: number;
    new_count: number;
    rented_count: number;
    snapshot_count: number;
  };
}

export interface OccupancySnapshotStreamErrorEvent {
  type: "error";
  message: string;
}

export type OccupancySnapshotStreamEvent =
  | OccupancySnapshotStreamProgressEvent
  | OccupancySnapshotStreamDoneEvent
  | OccupancySnapshotStreamErrorEvent;

export function occupancySnapshotProgressPercent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}
