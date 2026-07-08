import { NextResponse } from "next/server";
import { loadListingsPreview } from "@/lib/occupancy/listings-preview";
import { runOccupancySnapshot } from "@/lib/occupancy/snapshot";

export const maxDuration = 120;

export async function POST() {
  try {
    const result = await runOccupancySnapshot();
    const listings_preview = await loadListingsPreview();
    return NextResponse.json({
      metrics: result.metrics,
      listings_preview,
      fetched_count: result.fetched_count,
      new_count: result.new_count,
      rented_count: result.rented_count,
      snapshot_count: result.registry.snapshot_count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot non riuscito";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
