import { NextResponse } from "next/server";
import { loadRemovalEvents } from "@/lib/occupancy/removal-log";
import { resolveOccupancyCitySlug, resolveOccupancyOperation } from "@/lib/occupancy/constants";
import { resolveOccupancyPortal } from "@/lib/occupancy/portals";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portal = searchParams.get("portal");
    const city = searchParams.get("city");
    const operation = resolveOccupancyOperation(searchParams.get("operation"));
    const rawLimit = searchParams.get("limit");
    const limit =
      rawLimit == null || rawLimit === ""
        ? undefined
        : Math.max(Number(rawLimit) || 1, 1);
    const citySlug = resolveOccupancyCitySlug(city);
    const resolvedPortal = resolveOccupancyPortal(portal, citySlug);
    const events = await loadRemovalEvents(citySlug, resolvedPortal, limit, operation);
    return NextResponse.json({ events, portal: resolvedPortal, city: citySlug, operation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lettura log rimozioni non riuscita";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
