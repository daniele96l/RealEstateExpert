import { NextResponse } from "next/server";
import { loadOccupancyDashboard } from "@/lib/occupancy/dashboard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf");
    const data = await loadOccupancyDashboard(asOf);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lettura metriche non riuscita";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
