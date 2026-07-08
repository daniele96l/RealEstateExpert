import { computeOccupancyMetrics } from "./metrics";
import { loadListingsPreview } from "./listings-preview";
import { loadRegistry } from "./registry";
import type { OccupancyDashboardData } from "@/lib/types";

export async function loadOccupancyDashboard(): Promise<OccupancyDashboardData> {
  const [registry, listings_preview] = await Promise.all([
    loadRegistry(),
    loadListingsPreview(),
  ]);
  const metrics = await computeOccupancyMetrics(registry);
  return { metrics, listings_preview };
}
