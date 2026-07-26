export type OccupancyOperation = "rent" | "sale";

export const DEFAULT_OCCUPANCY_OPERATION: OccupancyOperation = "rent";

export function isOccupancyOperation(value: unknown): value is OccupancyOperation {
  return value === "rent" || value === "sale";
}

export function resolveOccupancyOperation(value?: string | null): OccupancyOperation {
  return value === "sale" ? "sale" : "rent";
}

/** i18n root for tracking dashboards */
export function occupancyI18nRoot(operation: OccupancyOperation): "occupancy" | "saleRate" {
  return operation === "sale" ? "saleRate" : "occupancy";
}
