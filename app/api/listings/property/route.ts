import { NextResponse } from "next/server";
import { getDefaultListingsProvider, hasRapidApiKey, hasScrapingBeeKey } from "@/lib/server/config";
import { fetchPropertyDetailsByUrl as fetchRapidDetail } from "@/lib/server/rapidapi-idealista";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import { fetchPropertyDetailsViaScrapingBee } from "@/lib/server/idealista-import";
import { getPropertyDetailCache, savePropertyDetailCache } from "@/lib/server/property-detail-cache";
import { listingToDetail } from "@/lib/server/property-detail";
import { ScrapingBeeError } from "@/lib/server/scrapingbee";
import type { ListingsProvider, MapListing } from "@/lib/types";

export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (id) {
    const cached = await getPropertyDetailCache(id);
    if (!cached) {
      return NextResponse.json({ detail: "Nessun dettaglio in cache per questo annuncio" }, { status: 404 });
    }
    return NextResponse.json(cached);
  }

  return NextResponse.json({
    default_provider: getDefaultListingsProvider(),
    scrapingbee: hasScrapingBeeKey(),
    rapidapi: hasRapidApiKey(),
  });
}

async function fetchDetail(
  url: string,
  provider: ListingsProvider,
  base?: MapListing,
) {
  if (provider === "rapidapi") {
    return fetchRapidDetail(url, base);
  }
  const listing = await fetchPropertyDetailsViaScrapingBee(url);
  return listingToDetail({ ...listing, ...base, id: listing.id || base?.id || "" });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      listing?: MapListing;
      refresh?: boolean;
      provider?: ListingsProvider;
    };

    const url = body.url ?? body.listing?.url;
    if (!url?.trim()) {
      return NextResponse.json({ detail: "URL annuncio obbligatorio" }, { status: 400 });
    }

    const idMatch = url.match(/\/immobile\/(\d+)/);
    const id = body.listing?.id ?? idMatch?.[1];

    if (id && !body.refresh) {
      const cached = await getPropertyDetailCache(id);
      if (cached) return NextResponse.json(cached);
    }

    const preferred = body.provider ?? getDefaultListingsProvider();
    const order: ListingsProvider[] =
      preferred === "rapidapi" ? ["rapidapi", "scrapingbee"] : ["scrapingbee", "rapidapi"];
    const available = order.filter((p) => (p === "rapidapi" ? hasRapidApiKey() : hasScrapingBeeKey()));

    if (!available.length) {
      return NextResponse.json(
        { detail: "Nessuna API configurata. Aggiungi RAPIDAPI_KEY o SCRAPINGBEE_API_KEY in .env.local" },
        { status: 500 },
      );
    }

    let lastError: unknown;
    for (const provider of available) {
      try {
        const detail = await fetchDetail(url, provider, body.listing);
        await savePropertyDetailCache(detail);
        return NextResponse.json(detail);
      } catch (err) {
        lastError = err;
      }
    }

    if (body.listing) {
      const fallback = listingToDetail(body.listing);
      await savePropertyDetailCache(fallback);
      return NextResponse.json(fallback);
    }

    throw lastError;
  } catch (err) {
    if (err instanceof RapidApiIdealistaError) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof ScrapingBeeError) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ detail: err.message }, { status: 500 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}
