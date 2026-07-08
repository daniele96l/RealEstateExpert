import { NextResponse } from "next/server";
import { isMarketId, type MarketId } from "@/lib/markets";
import { GeocodeError } from "@/lib/server/geocode";
import { IdealistaSearchError } from "@/lib/server/idealista-search";
import { getCache, saveCache } from "@/lib/server/listings-cache";
import {
  enrichCityListingsCache,
  getEnrichedCache,
} from "@/lib/server/listing-condition-enrich";
import { fetchItalyListingsWithFallback } from "@/lib/server/italy-listings-fetch";
import { resolvePreferredProvider } from "@/lib/server/listings-fetch";
import { fetchSrealityCityListings, SrealitySearchError } from "@/lib/server/sreality-search";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import { RealtyApiImmobiliareError } from "@/lib/server/realtyapi-immobiliare";
import { hasRapidApiKey, hasScrapingBeeKey, hasRealtyApiKey, getDefaultListingsProvider } from "@/lib/server/config";
import { ScrapingBeeError } from "@/lib/server/scrapingbee";
import type { ListingsProvider } from "@/lib/types";
import { resolveBatchFetchPageLimit, resolveItalyListingMaxPages } from "@/lib/batch-fetch-pages";
import { CZECH_DEFAULTS } from "@/lib/constants-cz";

export const maxDuration = 120;

function parseMarket(value: string | null | undefined): MarketId {
  return isMarketId(value) ? value : "it";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const operation = searchParams.get("operation");
  const market = parseMarket(searchParams.get("market"));

  if (city && operation) {
    if (operation !== "sale" && operation !== "rent") {
      return NextResponse.json({ detail: "operation non valida" }, { status: 400 });
    }

    const cached = await getEnrichedCache(market, city, operation);
    if (!cached) {
      return NextResponse.json({ detail: "Nessun dato in cache per questa città" }, { status: 404 });
    }
    return NextResponse.json(cached);
  }

  return NextResponse.json({
    default_provider: getDefaultListingsProvider(),
    scrapingbee: hasScrapingBeeKey(),
    rapidapi: hasRapidApiKey(),
    realtyapi: hasRealtyApiKey(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      operation?: "sale" | "rent";
      refresh?: boolean;
      provider?: ListingsProvider;
      market?: MarketId;
      maxPages?: number;
    };

    if (!body.city?.trim()) {
      return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
    }
    if (body.operation !== "sale" && body.operation !== "rent") {
      return NextResponse.json({ detail: "operation deve essere sale o rent" }, { status: 400 });
    }

    const market = parseMarket(body.market);

    if (!body.refresh) {
      const cached = await getEnrichedCache(market, body.city, body.operation);
      if (cached) return NextResponse.json(cached);
    }

    if (market === "cz") {
      const maxPages = resolveBatchFetchPageLimit(body.maxPages, "cz");
      const data = await fetchSrealityCityListings(body.city, body.operation, market, { maxPages });
      const enriched = await enrichCityListingsCache({ ...data, provider: "sreality" });
      await saveCache(enriched, market);
      return NextResponse.json(enriched);
    }

    const preferred = resolvePreferredProvider(body.provider);
    const maxPages = resolveItalyListingMaxPages(body.maxPages);
    const { data, provider } = await fetchItalyListingsWithFallback(
      body.city,
      body.operation,
      preferred,
      maxPages,
    );
    const enriched = await enrichCityListingsCache({ ...data, provider });
    await saveCache(enriched, market);
    return NextResponse.json(enriched);
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (
      err instanceof IdealistaSearchError ||
      err instanceof ScrapingBeeError ||
      err instanceof RapidApiIdealistaError ||
      err instanceof RealtyApiImmobiliareError ||
      err instanceof SrealitySearchError
    ) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ detail: "Timeout durante il download. Riprova tra qualche minuto." }, { status: 504 });
    }
    if (err instanceof Error && (err.message.includes("RAPIDAPI_KEY") || err.message.includes("SCRAPINGBEE_API_KEY") || err.message.includes("Nessuna API"))) {
      return NextResponse.json({ detail: err.message }, { status: 500 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}
