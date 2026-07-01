import { NextResponse } from "next/server";
import { GeocodeError } from "@/lib/server/geocode";
import { fetchCityListings, IdealistaSearchError } from "@/lib/server/idealista-search";
import { getCache, saveCache } from "@/lib/server/listings-cache";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import { getDefaultListingsProvider, hasRapidApiKey, hasScrapingBeeKey } from "@/lib/server/config";
import { ScrapingBeeError } from "@/lib/server/scrapingbee";
import type { ListingsProvider } from "@/lib/types";

export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const operation = searchParams.get("operation");

  if (city && operation) {
    if (operation !== "sale" && operation !== "rent") {
      return NextResponse.json({ detail: "operation non valida" }, { status: 400 });
    }

    const cached = await getCache(city, operation);
    if (!cached) {
      return NextResponse.json({ detail: "Nessun dato in cache per questa città" }, { status: 404 });
    }
    return NextResponse.json(cached);
  }

  return NextResponse.json({
    default_provider: getDefaultListingsProvider(),
    scrapingbee: hasScrapingBeeKey(),
    rapidapi: hasRapidApiKey(),
  });
}

async function fetchWithFallback(
  city: string,
  operation: "sale" | "rent",
  preferred: ListingsProvider,
): Promise<{ data: Awaited<ReturnType<typeof fetchCityListings>>; provider: ListingsProvider }> {
  const order: ListingsProvider[] =
    preferred === "rapidapi" ? ["rapidapi", "scrapingbee"] : ["scrapingbee", "rapidapi"];

  const available = order.filter((p) => (p === "rapidapi" ? hasRapidApiKey() : hasScrapingBeeKey()));
  if (!available.length) {
    throw new Error("Nessuna API configurata. Aggiungi RAPIDAPI_KEY o SCRAPINGBEE_API_KEY in .env.local");
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      const data = await fetchCityListings(city, operation, provider);
      return { data, provider };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new IdealistaSearchError(`Impossibile recuperare annunci per ${city}`);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      operation?: "sale" | "rent";
      refresh?: boolean;
      provider?: ListingsProvider;
    };

    if (!body.city?.trim()) {
      return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
    }
    if (body.operation !== "sale" && body.operation !== "rent") {
      return NextResponse.json({ detail: "operation deve essere sale o rent" }, { status: 400 });
    }

    if (!body.refresh) {
      const cached = await getCache(body.city, body.operation);
      if (cached) return NextResponse.json(cached);
    }

    const preferred = body.provider ?? getDefaultListingsProvider();
    const { data, provider } = await fetchWithFallback(body.city, body.operation, preferred);
    const payload = { ...data, provider };
    await saveCache(payload);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof IdealistaSearchError || err instanceof ScrapingBeeError || err instanceof RapidApiIdealistaError) {
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
