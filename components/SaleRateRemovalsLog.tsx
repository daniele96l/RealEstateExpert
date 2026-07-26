"use client";

import OccupancyRemovalsLog from "@/components/OccupancyRemovalsLog";

/** Presumed-sold log for Sale Rate (buy tracking). */
export default function SaleRateRemovalsLog({
  refreshToken = 0,
}: {
  refreshToken?: number;
}) {
  return <OccupancyRemovalsLog refreshToken={refreshToken} operation="sale" />;
}
