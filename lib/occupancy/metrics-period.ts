export type OccupancyMetricsPeriod = "daily" | "weekly" | "monthly" | "longest";

export const DEFAULT_OCCUPANCY_METRICS_PERIOD: OccupancyMetricsPeriod = "monthly";

export const OCCUPANCY_METRICS_PERIOD_DAYS: Record<
  Exclude<OccupancyMetricsPeriod, "longest">,
  number
> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export function isOccupancyMetricsPeriod(value: string): value is OccupancyMetricsPeriod {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "longest";
}

export function resolveOccupancyMetricsPeriod(
  value: string | null | undefined,
): OccupancyMetricsPeriod {
  return value && isOccupancyMetricsPeriod(value) ? value : DEFAULT_OCCUPANCY_METRICS_PERIOD;
}

export function occupancyMetricsPeriodDays(
  period: Exclude<OccupancyMetricsPeriod, "longest">,
): number {
  return OCCUPANCY_METRICS_PERIOD_DAYS[period];
}
