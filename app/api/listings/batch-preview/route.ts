import { NextResponse } from "next/server";
import type { ListingSource } from "@/lib/listing-url";
import { isMarketId, type MarketId } from "@/lib/markets";
import { GeocodeError, geocodeCity } from "@/lib/server/geocode";
import { IdealistaSearchError } from "@/lib/server/idealista-search";
import {
  buildImmobiliareSearchQuery,
  fetchImmobiliareWithFallback,
  ImmobiliareSearchError,
} from "@/lib/server/immobiliare-listings-fetch";
import { getCache, mergeListingCache, replaceListingCache, saveCache } from "@/lib/server/listings-cache";
import {
  buildSearchQuery,
  fetchWithFallback,
  resolvePreferredProvider,
} from "@/lib/server/listings-fetch";
import { fetchSrealityCityListings, SrealitySearchError } from "@/lib/server/sreality-search";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import { RapidApiImmobiliareError } from "@/lib/server/rapidapi-immobiliare";
import { RealtyApiImmobiliareError } from "@/lib/server/realtyapi-immobiliare";
import { hasRapidApiKey, hasScrapingBeeKey, hasRealtyApiKey, getDefaultListingsProvider } from "@/lib/server/config";
import { ScrapingBeeError } from "@/lib/server/scrapingbee";
import type { BatchPreviewResult, ListingsProvider } from "@/lib/types";
import { ITALY_DEFAULTS } from "@/lib/constants";
import { CZECH_DEFAULTS } from "@/lib/constants-cz";

export const maxDuration = 120;

function parseMarket(value: string | null | undefined): MarketId {
  return isMarketId(value) ? value : "it";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      zone?: string;
      operations?: ("sale" | "rent")[];
      refresh?: boolean;
      provider?: ListingsProvider;
      portal?: ListingSource;
      maxPages?: number;
      market?: MarketId;
    };

    if (!body.city?.trim()) {
      return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
    }

    const market = parseMarket(body.market);
    const operations = body.operations?.length
      ? body.operations.filter((op) => op === "sale" || op === "rent")
      : (["sale", "rent"] as const);

    if (!operations.length) {
      return NextResponse.json({ detail: "Seleziona almeno un'operazione" }, { status: 400 });
    }

    const maxPagesDefault =
      market === "cz" ? CZECH_DEFAULTS.batch_fetch_max_pages : ITALY_DEFAULTS.batch_fetch_max_pages;
    const maxPagesCap =
      market === "cz" ? CZECH_DEFAULTS.batch_fetch_max_pages_cap : ITALY_DEFAULTS.batch_fetch_max_pages_cap;
    const maxPages = Math.min(Math.max(body.maxPages ?? maxPagesDefault, 1), maxPagesCap);

    if (market === "cz") {
      if (!body.refresh) {
        const cachedParts = await Promise.all(
          operations.map(async (operation) => {
            const cached = await getCache(market, body.city!, operation);
            return cached ? { operation, cached } : null;
          }),
        );
        const hits = cachedParts.filter((p): p is NonNullable<typeof p> => p != null);
        if (hits.length === operations.length) {
          const center = hits[0]!.cached.center;
          const result: BatchPreviewResult = {
            city: hits[0]!.cached.city,
            center,
            provider: "sreality",
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
          const data = await fetchSrealityCityListings(body.city!, operation, market, { maxPages });
          return { operation, data: { ...data, provider: "sreality" as const }, provider: "sreality" as const };
        }),
      );

      const centerData = await geocodeCity(body.city!.trim(), market);
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
        city: results[0]?.data.city ?? body.city!.trim(),
        center: {
          lat: centerData.lat || avgLat,
          lng: centerData.lng || avgLng,
          display_name: centerData.display_name ?? null,
        },
        provider: "sreality",
        fetched_at: new Date().toISOString(),
      };

      for (const { operation, data } of results) {
        const existing = await getCache(market, body.city!, operation);
        const merged = body.refresh
          ? replaceListingCache(existing, data)
          : mergeListingCache(existing, data);
        await saveCache(merged, market);
        if (operation === "sale") result.sale = merged;
        else result.rent = merged;
      }

      return NextResponse.json(result);
    }

    const portal: ListingSource = body.portal === "immobiliare" ? "immobiliare" : "idealista";
    const searchQuery =
      portal === "immobiliare"
        ? buildImmobiliareSearchQuery(body.city, body.zone)
        : buildSearchQuery(body.city, body.zone);
    const preferred = resolvePreferredProvider(body.provider);

    if (!body.refresh) {
      const cachedParts = await Promise.all(
        operations.map(async (operation) => {
          const cached = await getCache(market, searchQuery, operation);
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
        const { data, provider } =
          portal === "immobiliare"
            ? await fetchImmobiliareWithFallback(searchQuery, operation, preferred, maxPages)
            : await fetchWithFallback(searchQuery, operation, preferred, maxPages);
        return { operation, data: { ...data, provider }, provider };
      }),
    );

    const centerData = await geocodeCity(body.city.trim(), market);
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
      const existing = await getCache(market, data.city, operation);
      const merged = body.refresh
        ? replaceListingCache(existing, data)
        : mergeListingCache(existing, data);
      await saveCache(merged, market);
      if (operation === "sale") result.sale = merged;
      else result.rent = merged;
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (
      err instanceof IdealistaSearchError ||
      err instanceof ImmobiliareSearchError ||
      err instanceof ScrapingBeeError ||
      err instanceof RapidApiIdealistaError ||
      err instanceof RapidApiImmobiliareError ||
      err instanceof RealtyApiImmobiliareError ||
      err instanceof SrealitySearchError
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
    console.error("[batch-preview]", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    default_provider: getDefaultListingsProvider(),
    scrapingbee: hasScrapingBeeKey(),
    rapidapi: hasRapidApiKey(),
    realtyapi: hasRealtyApiKey(),
  });
}
