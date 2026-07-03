import { NextResponse } from "next/server";
import { getDefaultListingsProvider, hasRapidApiKey, hasScrapingBeeKey } from "@/lib/server/config";
import {
  cityListingsCacheFromDetail,
  extractListingCacheId,
} from "@/lib/server/import-cache";
import { IdealistaImportError, ImmobiliareImportError, importListingFromAnyUrl } from "@/lib/server/listing-import";
import { getPropertyDetailCache } from "@/lib/server/property-detail-cache";
import { RapidApiIdealistaError } from "@/lib/server/rapidapi-idealista";
import type { ListingsProvider } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      provider?: ListingsProvider;
      refresh?: boolean;
    };
    if (!body.url?.trim()) {
      return NextResponse.json({ detail: "URL obbligatorio" }, { status: 400 });
    }

    const preferred = body.provider ?? getDefaultListingsProvider();
    const listingId = extractListingCacheId(body.url.trim());

    if (!body.refresh && listingId) {
      const cachedDetail = await getPropertyDetailCache(listingId);
      if (cachedDetail) {
        return NextResponse.json(cityListingsCacheFromDetail(cachedDetail, preferred));
      }
    }

    const data = await importListingFromAnyUrl(
      body.url.trim(),
      preferred,
      hasRapidApiKey(),
      hasScrapingBeeKey(),
    );
    return NextResponse.json(data);
  } catch (err) {
    if (
      err instanceof IdealistaImportError ||
      err instanceof ImmobiliareImportError ||
      err instanceof RapidApiIdealistaError
    ) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ detail: "Timeout durante l'importazione. Riprova." }, { status: 504 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}
