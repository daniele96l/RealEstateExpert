import { NextResponse } from "next/server";
import type { ListingSource } from "@/lib/listing-url";
import { isMarketId, type MarketId } from "@/lib/markets";
import { GeocodeError } from "@/lib/server/geocode";
import { IdealistaSearchError } from "@/lib/server/idealista-search";
import { ImmobiliareSearchError } from "@/lib/server/immobiliare-search";
import { runBatchPreview } from "@/lib/server/batch-preview-run";
import { SrealitySearchError } from "@/lib/server/sreality-search";

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
  return NextResponse.json({ default_provider: "direct" });
}
