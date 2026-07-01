import { NextResponse } from "next/server";
import { normalizeCitySlug } from "@/lib/server/geocode";
import { getCache, mergeListingCache, mergeListings, saveCache } from "@/lib/server/listings-cache";
import type { BatchSaveResult, CityListingsCache, ListingsProvider, MapCenter, MapListing } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      center?: MapCenter;
      provider?: ListingsProvider;
      sale?: MapListing[];
      rent?: MapListing[];
    };

    if (!body.city?.trim()) {
      return NextResponse.json({ detail: "Città obbligatoria" }, { status: 400 });
    }
    if (!body.center) {
      return NextResponse.json({ detail: "Centro mappa obbligatorio" }, { status: 400 });
    }

    const saleListings = body.sale ?? [];
    const rentListings = body.rent ?? [];

    if (!saleListings.length && !rentListings.length) {
      return NextResponse.json({ detail: "Seleziona almeno un annuncio" }, { status: 400 });
    }

    const citySlug = normalizeCitySlug(body.city);
    const fetchedAt = new Date().toISOString();
    const provider = body.provider;

    let saleCache: CityListingsCache | undefined;
    let rentCache: CityListingsCache | undefined;

    if (saleListings.length) {
      const existing = await getCache(citySlug, "sale");
      saleCache = mergeListingCache(existing, {
        city: citySlug,
        operation: "sale",
        fetched_at: fetchedAt,
        center: body.center,
        listings: mergeListings(existing?.listings ?? [], saleListings),
        provider,
      });
      await saveCache(saleCache);
    }

    if (rentListings.length) {
      const existing = await getCache(citySlug, "rent");
      rentCache = mergeListingCache(existing, {
        city: citySlug,
        operation: "rent",
        fetched_at: fetchedAt,
        center: body.center,
        listings: mergeListings(existing?.listings ?? [], rentListings),
        provider,
      });
      await saveCache(rentCache);
    }

    const result: BatchSaveResult = {
      city: citySlug,
      center: body.center,
      provider: provider ?? "rapidapi",
      fetched_at: fetchedAt,
      sale: saleCache,
      rent: rentCache,
      listings: [...saleListings, ...rentListings],
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    );
  }
}
