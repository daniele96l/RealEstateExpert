export type OccupancyMetricsBasis = "tracking" | "posted";

export const DEFAULT_OCCUPANCY_METRICS_BASIS: OccupancyMetricsBasis = "tracking";

export const OCCUPANCY_METRICS_BASIS_STORAGE_KEY = "occupancy-metrics-basis";

export function resolveOccupancyMetricsBasis(value: string | null | undefined): OccupancyMetricsBasis {
  return value === "posted" ? "posted" : "tracking";
}
