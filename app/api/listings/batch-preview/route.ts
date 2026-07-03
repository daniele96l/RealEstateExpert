import { NextResponse } from "next/server";
import type { ListingSource } from "@/lib/listing-url";
import { isMarketId, type MarketId } from "@/lib/markets";
import { GeocodeError } from "@/lib/server/geocode";
import { IdealistaSearchError } from "@/lib/server/idealista-search";
import { ImmobiliareSearchError } from "@/lib/server/immobiliare-listings-fetch";
import { runBatchPreview } from "@/lib/server/batch-preview-run";
import { SrealitySearchError } from "@/lib/server/sreality-search";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import { RapidApiImmobiliareError } from "@/lib/server/rapidapi-immobiliare";
import { RealtyApiImmobiliareError } from "@/lib/server/realtyapi-immobiliare";
import { hasRapidApiKey, hasScrapingBeeKey, hasRealtyApiKey, getDefaultListingsProvider } from "@/lib/server/config";
import { ScrapingBeeError } from "@/lib/server/scrapingbee";
import type { ListingsProvider } from "@/lib/types";

export const maxDuration = 120;

function parseMarket(value: string | null | undefined): MarketId {
  return isMarketId(value) ? value : "it";
}

function batchPreviewErrorResponse(err: unknown): NextResponse {
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
      stream?: boolean;
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

    const requestPayload = {
      city: body.city.trim(),
      zone: body.zone,
      operations: [...operations],
      refresh: body.refresh,
      provider: body.provider,
      portal: body.portal,
      maxPages: body.maxPages,
      market,
    };

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await runBatchPreview(requestPayload, (event) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            });
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done", result })}\n`));
          } catch (err) {
            const message = err instanceof Error ? err.message : "Errore interno";
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await runBatchPreview(requestPayload);
    return NextResponse.json(result);
  } catch (err) {
    return batchPreviewErrorResponse(err);
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
