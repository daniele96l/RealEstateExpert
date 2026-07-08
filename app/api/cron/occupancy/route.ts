import { NextResponse } from "next/server";
import { runOccupancySnapshot } from "@/lib/occupancy/snapshot";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { isServerCacheReadOnly } from "@/lib/server/fs-cache-io";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runOccupancySnapshot();

    return NextResponse.json({
      ok: true,
      snapshot_count: result.registry.snapshot_count,
      fetched_count: result.fetched_count,
      new_count: result.new_count,
      rented_count: result.rented_count,
      active_count: result.metrics.active_count,
      provider: result.registry.last_provider,
      read_only_host: isServerCacheReadOnly(),
      warning: isServerCacheReadOnly()
        ? "Vercel filesystem is read-only — snapshot data is not persisted. Use a writable host or add blob storage."
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Occupancy cron failed";
    return NextResponse.json({ ok: false, detail: message }, { status: 500 });
  }
}
