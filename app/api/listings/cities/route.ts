import { NextResponse } from "next/server";
import { isMarketId, type MarketId } from "@/lib/markets";
import { listCachedListingCities } from "@/lib/server/list-cached-cities";

function parseMarket(value: string | null | undefined): MarketId {
  return isMarketId(value) ? value : "it";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = parseMarket(searchParams.get("market"));
  const cities = await listCachedListingCities(market);
  return NextResponse.json({ cities });
}
