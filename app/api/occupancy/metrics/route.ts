import { NextResponse } from "next/server";
import { loadOccupancyDashboard } from "@/lib/occupancy/dashboard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf");
    const portal = searchParams.get("portal");
    const city = searchParams.get("city");
    const period = searchParams.get("period");
    const basis = searchParams.get("basis");
    const data = await loadOccupancyDashboard(asOf, portal, city, period, basis);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lettura metriche non riuscita";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
