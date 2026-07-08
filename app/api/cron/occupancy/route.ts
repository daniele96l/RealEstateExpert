import { NextResponse } from "next/server";
import { runOccupancySnapshot } from "@/lib/occupancy/snapshot";
import {
  OCCUPANCY_PORTALS,
  isOccupancyPortal,
  type OccupancyPortal,
} from "@/lib/occupancy/portals";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { isServerCacheReadOnly } from "@/lib/server/fs-cache-io";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface PortalCronResult {
  portal: OccupancyPortal;
  ok: boolean;
  snapshot_count?: number;
  fetched_count?: number;
  new_count?: number;
  rented_count?: number;
  active_count?: number;
  provider?: string | null;
  detail?: string;
}

async function runPortalCron(portal: OccupancyPortal): Promise<PortalCronResult> {
  try {
    const result = await runOccupancySnapshot(portal);
    return {
      portal,
      ok: true,
      snapshot_count: result.registry.snapshot_count,
      fetched_count: result.fetched_count,
      new_count: result.new_count,
      rented_count: result.rented_count,
      active_count: result.metrics.active_count,
      provider: result.registry.last_provider,
    };
  } catch (err) {
    return {
      portal,
      ok: false,
      detail: err instanceof Error ? err.message : "Occupancy cron failed",
    };
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const portalParam = new URL(request.url).searchParams.get("portal");
  const portals =
    portalParam && isOccupancyPortal(portalParam) ? [portalParam] : [...OCCUPANCY_PORTALS];

  const results: PortalCronResult[] = [];
  for (const portal of portals) {
    results.push(await runPortalCron(portal));
  }

  const failures = results.filter((r) => !r.ok);
  const ok = failures.length === 0;

  return NextResponse.json(
    {
      ok,
      portals: results,
      read_only_host: isServerCacheReadOnly(),
      warning: isServerCacheReadOnly()
        ? "Vercel filesystem is read-only — snapshot data is not persisted. Use a writable host or add blob storage."
        : undefined,
    },
    { status: ok ? 200 : failures.length === results.length ? 500 : 207 },
  );
}
