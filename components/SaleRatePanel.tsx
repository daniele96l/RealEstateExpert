"use client";

import OccupancyRatePanel from "@/components/OccupancyRatePanel";

/** Buy/sale tracking dashboard — separate entry from Occupancy (rent). */
export default function SaleRatePanel({
  onDataMutated,
}: {
  onDataMutated?: () => void;
} = {}) {
  return <OccupancyRatePanel operation="sale" onDataMutated={onDataMutated} />;
}
