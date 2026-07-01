import { NextResponse } from "next/server";
import { GeocodeError } from "@/lib/server/geocode";
import {
  getDefaultMarketProvider,
  hasImmobiliareInsightsCredentials,
  hasScrapingBeeKey,
} from "@/lib/server/config";
import {
  fetchMarketHistory,
  ImmobiliareInsightsError,
  ImmobiliareMarketError,
  ScrapingBeeError,
} from "@/lib/server/immobiliare-market";
import { getMarketCache, saveMarketCache } from "@/lib/server/market-cache";
import type { MarketProviderMode } from "@/lib/server/config";

export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();

  if (city) {
    const cached = await getMarketCache(city);
    if (!cached) {
      return NextResponse.json({ detail: "Nessun dato mercato in cache per questa città" }, { status: 404 });
    }
    return NextResponse.json(cached);
  }

  return NextResponse.json({
    default_provider: getDefaultMarketProvider(),
    scrapingbee: hasScrapingBeeKey(),
    insights: hasImmobiliareInsightsCredentials(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      refresh?: boolean;
      provider?: MarketProviderMode;
    };

    if (!body.city?.trim()) {
      return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
    }

    if (!body.refresh) {
      const cached = await getMarketCache(body.city);
      if (cached) return NextResponse.json(cached);
    }

    const preferred = body.provider ?? getDefaultMarketProvider();
    const data = await fetchMarketHistory(body.city, preferred);
    await saveMarketCache(data);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (
      err instanceof ImmobiliareMarketError ||
      err instanceof ScrapingBeeError ||
      err instanceof ImmobiliareInsightsError
    ) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ detail: "Timeout durante il download. Riprova tra qualche minuto." }, { status: 504 });
    }
    if (err instanceof Error && err.message.includes("Nessun provider")) {
      return NextResponse.json({ detail: err.message }, { status: 500 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}
