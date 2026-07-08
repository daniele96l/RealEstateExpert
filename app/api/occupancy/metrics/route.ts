import { NextResponse } from "next/server";
import { loadOccupancyDashboard } from "@/lib/occupancy/dashboard";

export async function GET() {
  try {
    const data = await loadOccupancyDashboard();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lettura metriche non riuscita";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
