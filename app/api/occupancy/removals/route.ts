import { NextResponse } from "next/server";
import { loadRemovalEvents } from "@/lib/occupancy/removal-log";
import { DEFAULT_OCCUPANCY_PORTAL, isOccupancyPortal } from "@/lib/occupancy/constants";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portalParam = searchParams.get("portal");
    const limitParam = searchParams.get("limit");
    const portal = isOccupancyPortal(portalParam) ? portalParam : DEFAULT_OCCUPANCY_PORTAL;
    const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 50, 1), 200) : 50;
    const events = await loadRemovalEvents(portal, limit);
    return NextResponse.json({ events, portal });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lettura log rimozioni non riuscita";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
