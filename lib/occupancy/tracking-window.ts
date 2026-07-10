import type { OccupancySnapshot } from "@/lib/types";
import { OCCUPANCY_TURNOVER_DAYS, OCCUPANCY_WINDOW_DAYS } from "./constants";

export interface OccupancyMetricsContext {
  tracking_days: number;
  tracking_snapshot_days: number;
  tracking_started_at: string | null;
  tracking_ended_at: string | null;
  occupancy_window_days: number;
  turnover_window_days: number;
  occupancy_target_days: number;
  turnover_target_days: number;
  flow_metrics_ready: boolean;
}

function snapshotMs(snapshot: OccupancySnapshot): number {
  return new Date(snapshot.fetched_at).getTime();
}

export function resolveOccupancyMetricsContext(
  snapshots: OccupancySnapshot[],
  asOfMs: number,
): OccupancyMetricsContext {
  const ordered = snapshots
    .filter((s) => snapshotMs(s) <= asOfMs)
    .sort((a, b) => snapshotMs(a) - snapshotMs(b));

  const tracking_snapshot_days = new Set(
    ordered.map((snapshot) => snapshot.fetched_at.slice(0, 10)),
  ).size;

  const tracking_days =
    ordered.length === 0
      ? 0
      : Math.max(
          1,
          Math.ceil((asOfMs - snapshotMs(ordered[0]!)) / (24 * 60 * 60 * 1000)),
        );

  const tracking_started_at = ordered[0]?.fetched_at ?? null;
  const tracking_ended_at =
    ordered.length > 0 ? new Date(asOfMs).toISOString() : null;

  const flow_metrics_ready = tracking_snapshot_days >= 2;

  const occupancy_window_days = flow_metrics_ready
    ? Math.min(OCCUPANCY_WINDOW_DAYS, tracking_days)
    : 0;
  const turnover_window_days = flow_metrics_ready
    ? Math.min(OCCUPANCY_TURNOVER_DAYS, tracking_days)
    : 0;

  return {
    tracking_days,
    tracking_snapshot_days,
    tracking_started_at,
    tracking_ended_at,
    occupancy_window_days,
    turnover_window_days,
    occupancy_target_days: OCCUPANCY_WINDOW_DAYS,
    turnover_target_days: OCCUPANCY_TURNOVER_DAYS,
    flow_metrics_ready,
  };
}

export function zoneInventoryBasis(
  cityAvgActive: number | null,
  cityActive: number,
  zoneActive: number,
): number | null {
  if (cityAvgActive != null && cityAvgActive > 0 && cityActive > 0 && zoneActive > 0) {
    return Math.max(1, Math.round(cityAvgActive * (zoneActive / cityActive)));
  }
  return zoneActive > 0 ? zoneActive : null;
}
