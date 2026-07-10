import { NextResponse } from "next/server";
import { GeocodeError } from "@/lib/server/geocode";
import { getDefaultMarketProvider } from "@/lib/server/config";
import { fetchMarketHistory, ImmobiliareMarketError } from "@/lib/server/immobiliare-market";
import { fetchSrealityMarketHistory, SrealityMarketError } from "@/lib/server/sreality-market";
import { getMarketCache, saveMarketCache } from "@/lib/server/market-cache";
import type { MarketId } from "@/lib/markets";

export const maxDuration = 120;

function parseMarket(value: string | null | undefined): MarketId {
  return value === "cz" ? "cz" : "it";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const market = parseMarket(searchParams.get("market"));

  if (city) {
    const cached = await getMarketCache(city, market);
    if (!cached) {
      return NextResponse.json({ detail: "Nessun dato mercato in cache per questa città" }, { status: 404 });
    }
    return NextResponse.json(cached);
  }

  return NextResponse.json({
    default_provider: getDefaultMarketProvider(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      refresh?: boolean;
      market?: MarketId;
    };

    if (!body.city?.trim()) {
      return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
    }

    const market = body.market === "cz" ? "cz" : "it";

    if (!body.refresh) {
      const cached = await getMarketCache(body.city, market);
      if (cached) return NextResponse.json(cached);
    }

    if (market === "cz") {
      const data = await fetchSrealityMarketHistory(body.city, market);
      await saveMarketCache(data, market);
      return NextResponse.json(data);
    }

    const data = await fetchMarketHistory(body.city);
    await saveMarketCache(data, market);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof ImmobiliareMarketError || err instanceof SrealityMarketError) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ detail: "Timeout durante il download. Riprova tra qualche minuto." }, { status: 504 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}
