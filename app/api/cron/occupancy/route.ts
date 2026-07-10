import { NextResponse } from "next/server";
import { runOccupancySnapshot } from "@/lib/occupancy/snapshot";
import {
  isOccupancyPortal,
  type OccupancyPortal,
} from "@/lib/occupancy/portals";
import {
  getOccupancyCityConfig,
  isOccupancyCitySlug,
  type OccupancyCitySlug,
} from "@/lib/occupancy/cities";
import { portalsForCity } from "@/lib/occupancy/portals";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { isServerCacheReadOnly } from "@/lib/server/fs-cache-io";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface PortalCronResult {
  city: OccupancyCitySlug;
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

async function runPortalCron(
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
): Promise<PortalCronResult> {
  try {
    const result = await runOccupancySnapshot(portal, undefined, { citySlug });
    return {
      city: citySlug,
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
      city: citySlug,
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

  const { searchParams } = new URL(request.url);
  const portalParam = searchParams.get("portal");
  const cityParam = searchParams.get("city");
  const citySlug: OccupancyCitySlug = isOccupancyCitySlug(cityParam) ? cityParam : "reggio_calabria";
  const portals =
    portalParam && isOccupancyPortal(portalParam)
      ? [portalParam]
      : portalsForCity(citySlug);

  const results: PortalCronResult[] = [];
  for (const portal of portals) {
    results.push(await runPortalCron(citySlug, portal));
  }

  const failures = results.filter((r) => !r.ok);
  const ok = failures.length === 0;

  return NextResponse.json(
    {
      ok,
      city: citySlug,
      city_label: getOccupancyCityConfig(citySlug).city,
      portals: results,
      read_only_host: isServerCacheReadOnly(),
      warning: isServerCacheReadOnly()
        ? "Vercel filesystem is read-only — snapshot data is not persisted. Use a writable host or add blob storage."
        : undefined,
    },
    { status: ok ? 200 : failures.length === results.length ? 500 : 207 },
  );
}
