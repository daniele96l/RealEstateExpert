import { NextResponse } from "next/server";
import { resolveOccupancyCitySlug } from "@/lib/occupancy/constants";
import { resolveOccupancyPortal } from "@/lib/occupancy/portals";
import { backfillSrealityDescriptions } from "@/lib/occupancy/backfill-sreality-descriptions";
import { isServerCacheReadOnly } from "@/lib/server/fs-cache-io";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (isServerCacheReadOnly()) {
    return NextResponse.json(
      { detail: "Description backfill is not available on read-only hosts." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      city?: string;
      portal?: string;
    };
    const citySlug = resolveOccupancyCitySlug(body.city ?? "brno");
    const portal = resolveOccupancyPortal(body.portal ?? "sreality", citySlug);

    if (citySlug !== "brno" || portal !== "sreality") {
      return NextResponse.json(
        { detail: "Description backfill is only supported for Brno / Sreality." },
        { status: 400 },
      );
    }

    const result = await backfillSrealityDescriptions(citySlug, portal);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
