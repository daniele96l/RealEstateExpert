import { NextResponse } from "next/server";
import { isMarketId } from "@/lib/markets";
import { GeocodeError, geocodeCity } from "@/lib/server/geocode";
import { buildSearchQuery } from "@/lib/server/listings-fetch";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const zone = searchParams.get("zone")?.trim();
  const market = isMarketId(searchParams.get("market")) ? searchParams.get("market")! : "it";

  if (!city) {
    return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
  }

  try {
    const query = buildSearchQuery(city, zone);
    const geo = await geocodeCity(query, market as "it" | "cz");
    return NextResponse.json({
      lat: geo.lat,
      lng: geo.lng,
      display_name: geo.display_name ?? query,
    });
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    return NextResponse.json({ detail: "Geocoding non riuscito" }, { status: 500 });
  }
}
