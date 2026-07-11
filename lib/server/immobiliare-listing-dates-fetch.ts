import { extractImmobiliareListingId } from "@/lib/listing-url";
import type { MapListing } from "@/lib/types";
import { fetchImmobiliareListingHtml } from "@/lib/server/immobiliare-browser";
import { extractImmobiliareListingDates } from "@/lib/server/immobiliare-dates";
import { findRealEstateNode } from "@/lib/server/immobiliare-scraper";
import type { ReggioRentalsFetchProgress } from "@/lib/server/reggio-rentals-fetch";

const PAGE_DELAY_MS = 1500;

function extractNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

async function fetchListingHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (html.includes("__NEXT_DATA__") && !/datadome|captcha/i.test(html)) {
      return html;
    }
  } catch {
    /* fall through */
  }

  try {
    return await fetchImmobiliareListingHtml(url);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichImmobiliareListingDates(
  listings: MapListing[],
  onProgress?: (progress: ReggioRentalsFetchProgress) => void,
): Promise<MapListing[]> {
  const pending = listings.filter(
    (listing) => !listing.listing_published_at || !listing.listing_updated_at,
  );
  if (!pending.length) return listings;

  const byId = new Map(listings.map((listing) => [listing.id, { ...listing }]));
  const uniqueUrls = [...new Set(pending.map((listing) => listing.url).filter(Boolean))] as string[];
  let done = 0;

  onProgress?.({
    page: 1,
    maxPages: 1,
    listingsTotal: listings.length,
    phase: "enrich",
    enrichDone: 0,
    enrichTotal: uniqueUrls.length,
  });

  for (const url of uniqueUrls) {
    const numericId = extractImmobiliareListingId(url);
    if (!numericId) {
      done += 1;
      continue;
    }

    const html = await fetchListingHtml(url);
    done += 1;
    onProgress?.({
      page: 1,
      maxPages: 1,
      listingsTotal: listings.length,
      phase: "enrich",
      enrichDone: done,
      enrichTotal: uniqueUrls.length,
    });

    if (!html) {
      if (done < uniqueUrls.length) await sleep(PAGE_DELAY_MS);
      continue;
    }

    const nextData = extractNextData(html);
    const realEstate = nextData ? findRealEstateNode(nextData, numericId) : null;
    if (!realEstate) {
      if (done < uniqueUrls.length) await sleep(PAGE_DELAY_MS);
      continue;
    }

    const properties = Array.isArray(realEstate.properties)
      ? (realEstate.properties as unknown[])
      : [];
    const propertyRow =
      properties[0] != null && typeof properties[0] === "object"
        ? (properties[0] as Record<string, unknown>)
        : undefined;
    const dates = extractImmobiliareListingDates(realEstate, propertyRow);

    for (const listing of byId.values()) {
      if (listing.url !== url) continue;
      listing.listing_published_at =
        listing.listing_published_at ?? dates.listing_published_at ?? null;
      listing.listing_updated_at =
        listing.listing_updated_at ?? dates.listing_updated_at ?? null;
    }

    if (done < uniqueUrls.length) await sleep(PAGE_DELAY_MS);
  }

  return [...byId.values()];
}
