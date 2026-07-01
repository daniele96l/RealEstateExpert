import { NextResponse } from "next/server";
import { getCache } from "@/lib/server/listings-cache";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ city: string; operation: string }> },
) {
  const { city, operation } = await params;

  if (operation !== "sale" && operation !== "rent") {
    return NextResponse.json({ detail: "operation non valida" }, { status: 400 });
  }

  const cached = await getCache(decodeURIComponent(city), operation);
  if (!cached) {
    return NextResponse.json({ detail: "Nessun dato in cache per questa città" }, { status: 404 });
  }

  return NextResponse.json(cached);
}
