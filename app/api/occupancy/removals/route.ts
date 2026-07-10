import { NextResponse } from "next/server";
import { loadRemovalEvents } from "@/lib/occupancy/removal-log";
import { resolveOccupancyCitySlug } from "@/lib/occupancy/constants";
import { resolveOccupancyPortal } from "@/lib/occupancy/portals";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portal = searchParams.get("portal");
    const city = searchParams.get("city");
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "500") || 500, 1), 500);
    const citySlug = resolveOccupancyCitySlug(city);
    const resolvedPortal = resolveOccupancyPortal(portal, citySlug);
    const events = await loadRemovalEvents(citySlug, resolvedPortal, limit);
    return NextResponse.json({ events, portal: resolvedPortal, city: citySlug });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lettura log rimozioni non riuscita";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
