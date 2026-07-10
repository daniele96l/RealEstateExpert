import { NextResponse } from "next/server";
import {
  cityListingsCacheFromDetail,
  extractListingCacheId,
} from "@/lib/server/import-cache";
import { IdealistaImportError, ImmobiliareImportError, importListingFromAnyUrl } from "@/lib/server/listing-import";
import { getPropertyDetailCache } from "@/lib/server/property-detail-cache";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      refresh?: boolean;
    };
    if (!body.url?.trim()) {
      return NextResponse.json({ detail: "URL obbligatorio" }, { status: 400 });
    }

    const listingId = extractListingCacheId(body.url.trim());

    if (!body.refresh && listingId) {
      const cachedDetail = await getPropertyDetailCache(listingId);
      if (cachedDetail) {
        return NextResponse.json(cityListingsCacheFromDetail(cachedDetail, "direct"));
      }
    }

    const data = await importListingFromAnyUrl(body.url.trim());
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof IdealistaImportError || err instanceof ImmobiliareImportError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ detail: "Timeout durante l'importazione. Riprova." }, { status: 504 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}
