import { NextResponse } from "next/server";
import { fetchPropertyDetailForListing } from "@/lib/server/fetch-property-detail";
import { getPropertyDetailCache, savePropertyDetailCache } from "@/lib/server/property-detail-cache";
import { syncListingConditionToCityCaches } from "@/lib/server/listing-condition-enrich";
import { listingToDetail } from "@/lib/server/property-detail";
import { propertyDetailCacheFileLabel } from "@/lib/property-detail-cache-client";
import { isSrealityListing, SrealityDetailError } from "@/lib/server/sreality-detail";
import { IdealistaImportError } from "@/lib/server/idealista-import";
import { ImmobiliareImportError } from "@/lib/server/immobiliare-import";
import type { ListingDetail, MapListing } from "@/lib/types";

function resolveListingCacheId(url: string, listing?: MapListing): string | undefined {
  if (listing?.id?.trim()) return listing.id.trim();
  const idealista = url.match(/\/immobile\/(\d+)/)?.[1];
  if (idealista) return idealista;
  const sreality = url.match(/sreality\.cz\/detail\/[\s\S]*?\/(\d+)\/?(?:\?|$)/i)?.[1];
  if (sreality) return `sr_${sreality}`;
  return undefined;
}

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

  return NextResponse.json({ default_provider: "direct" });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      listing?: MapListing;
      refresh?: boolean;
    };

    const url = body.url ?? body.listing?.url;
    if (!url?.trim()) {
      return NextResponse.json({ detail: "URL annuncio obbligatorio" }, { status: 400 });
    }

    const listingStub: MapListing =
      body.listing ??
      ({
        id: resolveListingCacheId(url) ?? "",
        url,
        operation: "sale",
        title: "",
        price: 0,
        lat: 0,
        lng: 0,
        sqm: null,
        rooms: null,
        address: null,
        property_type: null,
        property_type_label: null,
        condition_status: null,
        condition: null,
        needs_renovation: null,
      } satisfies MapListing);

    const id = resolveListingCacheId(url, listingStub);

    if (id && !body.refresh) {
      const cached = await getPropertyDetailCache(id);
      if (cached) {
        await syncListingConditionToCityCaches(cached);
        return NextResponse.json(cached);
      }
    }

    try {
      const detail = await fetchPropertyDetailForListing(listingStub);
      await savePropertyDetailCache(detail);
      await syncListingConditionToCityCaches(detail);
      return NextResponse.json(detail);
    } catch (err) {
      if (body.listing) {
        const fallback = listingToDetail(listingStub);
        await savePropertyDetailCache(fallback);
        return NextResponse.json(fallback);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof SrealityDetailError || err instanceof IdealistaImportError || err instanceof ImmobiliareImportError) {
      return NextResponse.json({ detail: err.message }, { status: 502 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ detail: err.message }, { status: 500 });
    }
    return NextResponse.json({ detail: "Errore interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { detail?: ListingDetail };
    const detail = body.detail;
    if (!detail?.id?.trim()) {
      return NextResponse.json({ detail: "detail.id obbligatorio" }, { status: 400 });
    }

    await savePropertyDetailCache(detail);
    await syncListingConditionToCityCaches(detail);

    return NextResponse.json({
      ok: true,
      path: propertyDetailCacheFileLabel(detail.id),
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Errore salvataggio cache" },
      { status: 500 },
    );
  }
}
