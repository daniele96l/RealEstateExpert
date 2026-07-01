import { NextResponse } from "next/server";
import { GeocodeError, geocodeCity } from "@/lib/server/geocode";
import { IdealistaSearchError } from "@/lib/server/idealista-search";
import { getCache, saveCache } from "@/lib/server/listings-cache";
import {
  buildSearchQuery,
  fetchWithFallback,
  resolvePreferredProvider,
} from "@/lib/server/listings-fetch";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import { hasRapidApiKey, hasScrapingBeeKey, getDefaultListingsProvider } from "@/lib/server/config";
import { ScrapingBeeError } from "@/lib/server/scrapingbee";
import type { BatchPreviewResult, ListingsProvider } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      zone?: string;
      operations?: ("sale" | "rent")[];
      refresh?: boolean;
      provider?: ListingsProvider;
    };

    if (!body.city?.trim()) {
      return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
    }

    const operations = body.operations?.length
      ? body.operations.filter((op) => op === "sale" || op === "rent")
      : (["sale", "rent"] as const);

    if (!operations.length) {
      return NextResponse.json({ detail: "Seleziona almeno un'operazione" }, { status: 400 });
    }

    const searchQuery = buildSearchQuery(body.city, body.zone);
    const preferred = resolvePreferredProvider(body.provider);

    if (!body.refresh) {
      const cachedParts = await Promise.all(
        operations.map(async (operation) => {
          const cached = await getCache(searchQuery, operation);
          return cached ? { operation, cached } : null;
        }),
      );
      const hits = cachedParts.filter((p): p is NonNullable<typeof p> => p != null);
      if (hits.length === operations.length) {
        const center = hits[0]!.cached.center;
        const provider = hits[0]!.cached.provider ?? preferred;
        const result: BatchPreviewResult = {
          city: hits[0]!.cached.city,
          center,
          provider,
          fetched_at: hits[0]!.cached.fetched_at,
        };
        for (const { operation, cached } of hits) {
          if (operation === "sale") result.sale = cached;
          else result.rent = cached;
        }
        return NextResponse.json(result);
      }
    }

    const results = await Promise.all(
      operations.map(async (operation) => {
        const { data, provider } = await fetchWithFallback(searchQuery, operation, preferred);
        return { operation, data: { ...data, provider }, provider };
      }),
    );

    const centerData = await geocodeCity(body.city.trim());
    const allListings = results.flatMap((r) => r.data.listings);
    const avgLat =
      allListings.length > 0
        ? allListings.reduce((s, l) => s + l.lat, 0) / allListings.length
        : centerData.lat;
    const avgLng =
      allListings.length > 0
        ? allListings.reduce((s, l) => s + l.lng, 0) / allListings.length
        : centerData.lng;

    const result: BatchPreviewResult = {
      city: results[0]?.data.city ?? body.city.trim(),
      center: {
        lat: centerData.lat || avgLat,
        lng: centerData.lng || avgLng,
        display_name: centerData.display_name ?? null,
      },
      provider: results[0]?.provider ?? preferred,
      fetched_at: new Date().toISOString(),
    };

    for (const { operation, data } of results) {
      if (operation === "sale") result.sale = data;
      else result.rent = data;
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (
      err instanceof IdealistaSearchError ||
      err instanceof ScrapingBeeError ||
      err instanceof RapidApiIdealistaError
    ) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { detail: "Timeout durante il download. Riprova tra qualche minuto." },
        { status: 504 },
      );
    }
    if (
      err instanceof Error &&
      (err.message.includes("RAPIDAPI_KEY") ||
        err.message.includes("SCRAPINGBEE_API_KEY") ||
        err.message.includes("Nessuna API"))
    ) {
      return NextResponse.json({ detail: err.message }, { status: 500 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    default_provider: getDefaultListingsProvider(),
    scrapingbee: hasScrapingBeeKey(),
    rapidapi: hasRapidApiKey(),
  });
}
