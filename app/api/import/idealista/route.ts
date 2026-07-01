import { NextResponse } from "next/server";
import { getDefaultListingsProvider, hasRapidApiKey, hasScrapingBeeKey } from "@/lib/server/config";
import { IdealistaImportError, importListingFromUrl } from "@/lib/server/idealista-import";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import { ScrapingBeeError } from "@/lib/server/scrapingbee";
import type { ListingsProvider } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; provider?: ListingsProvider };
    if (!body.url?.trim()) {
      return NextResponse.json({ detail: "URL obbligatorio" }, { status: 400 });
    }

    const preferred = body.provider ?? getDefaultListingsProvider();
    const data = await importListingFromUrl(
      body.url.trim(),
      preferred,
      hasRapidApiKey(),
      hasScrapingBeeKey(),
    );
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof IdealistaImportError || err instanceof RapidApiIdealistaError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof ScrapingBeeError) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ detail: "Timeout durante l'importazione. Riprova." }, { status: 504 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}
