import { ApifyClient } from "apify-client";
import { extractImmobiliareListingId, immobiliareListingCacheId } from "@/lib/listing-url";
import { resolveOccupancyCitySlug, type OccupancyCitySlug } from "@/lib/occupancy/constants";
import { loadRegistry } from "@/lib/occupancy/registry";
import { resolveOccupancyPortal, type OccupancyPortal } from "@/lib/occupancy/portals";
import { extractImmobiliareListingDates } from "@/lib/server/immobiliare-dates";
import { fetchImmobiliareListingHtml } from "@/lib/server/immobiliare-browser";

const DAY_MS = 24 * 60 * 60 * 1000;

import type {
  VerifyListingDatesLive,
  VerifyListingDatesResult,
  VerifyListingDatesStored,
} from "@/lib/types";

export type {
  VerifyListingDatesLive,
  VerifyListingDatesResult,
  VerifyListingDatesStored,
} from "@/lib/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeListingId(input: string): { cacheId: string; numericId: string; url: string } {
  const trimmed = input.trim();
  const fromUrl = extractImmobiliareListingId(trimmed);
  if (fromUrl) {
    return {
      cacheId: immobiliareListingCacheId(fromUrl),
      numericId: fromUrl,
      url: trimmed.startsWith("http") ? trimmed : `https://www.immobiliare.it/annunci/${fromUrl}/`,
    };
  }

  const bare = trimmed.replace(/^im_/, "");
  if (!/^\d+$/.test(bare)) {
    throw new Error("ID annuncio non valido — usa im_12345678 o un URL immobiliare.it/annunci/…");
  }
  return {
    cacheId: immobiliareListingCacheId(bare),
    numericId: bare,
    url: `https://www.immobiliare.it/annunci/${bare}/`,
  };
}

function readApifyDates(item: Record<string, unknown>): VerifyListingDatesLive {
  const enhanced = asRecord(item._enhanced) ?? {};
  const merged = { ...enhanced, ...item };
  const properties = merged.properties;
  const propertyRow = Array.isArray(properties) ? asRecord(properties[0]) : undefined;
  const dates = extractImmobiliareListingDates(merged, propertyRow ?? undefined);

  const creationDate =
    enhanced.creationDateIso ??
    enhanced.creationDate ??
    item.creationDateIso ??
    item.creationDate ??
    null;

  const priceRaw = item.priceAmount ?? enhanced.priceAmount ?? asRecord(item.price)?.raw;
  const price =
    typeof priceRaw === "number" && priceRaw > 0
      ? priceRaw
      : typeof priceRaw === "string"
        ? Number.parseFloat(priceRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || null
        : null;

  return {
    listing_published_at: dates.listing_published_at,
    listing_updated_at: dates.listing_updated_at,
    creationDate: creationDate as number | string | null,
    title: String(item.title ?? enhanced.title ?? "").trim() || null,
    price,
  };
}

function extractNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function liveFromHtml(html: string): VerifyListingDatesLive | null {
  const nextData = extractNextData(html);
  const pageProps = asRecord(asRecord(nextData)?.props);
  const re = asRecord(pageProps?.realEstate);
  if (!re) return null;

  const properties = re.properties;
  const propertyRow = Array.isArray(properties) ? asRecord(properties[0]) : undefined;
  const dates = extractImmobiliareListingDates(re, propertyRow ?? undefined);
  const priceValue = asRecord(re.price)?.value;

  return {
    listing_published_at: dates.listing_published_at,
    listing_updated_at: dates.listing_updated_at,
    creationDate: (re.creationDate as number | string | null) ?? null,
    title: String(re.title ?? "").trim() || null,
    price: typeof priceValue === "number" && priceValue > 0 ? priceValue : null,
  };
}

async function verifyViaPlaywright(url: string): Promise<VerifyListingDatesLive | null> {
  const html = await fetchImmobiliareListingHtml(url).catch(() => null);
  if (!html || /datadome|captcha/i.test(html)) return null;
  return liveFromHtml(html);
}

async function verifyViaApify(url: string): Promise<VerifyListingDatesLive | null> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) return null;

  const client = new ApifyClient({ token });
  const run = await client.actor("memo23/immobiliare-scraper").call(
    {
      startUrls: [url],
      maxItems: 1,
      proxyConfiguration: { useApifyProxy: true },
    },
    { waitSecs: 120 },
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const item = asRecord(items[0]);
  if (!item) return null;
  return readApifyDates(item);
}

function daysSincePublished(published: string | null, asOfMs: number): number | null {
  if (!published) return null;
  const publishedMs = new Date(published).getTime();
  if (!Number.isFinite(publishedMs)) return null;
  return Math.max(0, Math.round((asOfMs - publishedMs) / DAY_MS));
}

async function loadStoredListing(
  cacheId: string,
  citySlug: OccupancyCitySlug,
  portal: OccupancyPortal,
): Promise<VerifyListingDatesStored | null> {
  const registry = await loadRegistry(citySlug, portal);
  const listing = registry.listings[cacheId];
  if (!listing) return null;
  return {
    listing_published_at: listing.listing_published_at ?? null,
    listing_updated_at: listing.listing_updated_at ?? null,
    zone: listing.zone ?? null,
    address: listing.address ?? null,
    price: listing.price ?? null,
  };
}

export async function verifyImmobiliareListingDates(options: {
  id: string;
  city?: string | null;
  portal?: string | null;
  asOf?: string | null;
}): Promise<VerifyListingDatesResult> {
  const { cacheId, numericId, url } = normalizeListingId(options.id);
  const citySlug = resolveOccupancyCitySlug(options.city);
  const portal = resolveOccupancyPortal(options.portal, citySlug);
  const asOfMs = options.asOf ? new Date(options.asOf).getTime() : Date.now();
  const verifiedAt = new Date().toISOString();

  const [stored, liveFromBrowser] = await Promise.all([
    loadStoredListing(cacheId, citySlug, portal),
    verifyViaPlaywright(url),
  ]);

  let method: VerifyListingDatesResult["method"] = liveFromBrowser ? "playwright" : null;
  let live = liveFromBrowser;
  let blocked = !liveFromBrowser;

  if (!live) {
    live = await verifyViaApify(url);
    if (live) {
      method = "apify/memo23";
      blocked = false;
    }
  }

  const matchPublished =
    stored?.listing_published_at != null && live?.listing_published_at != null
      ? stored.listing_published_at === live.listing_published_at
      : null;
  const matchUpdated =
    stored?.listing_updated_at != null && live?.listing_updated_at != null
      ? stored.listing_updated_at === live.listing_updated_at
      : null;

  return {
    id: cacheId,
    numeric_id: numericId,
    url,
    method,
    blocked,
    live,
    stored,
    match_published: matchPublished,
    match_updated: matchUpdated,
    days_since_published: daysSincePublished(live?.listing_published_at ?? null, asOfMs),
    verified_at: verifiedAt,
  };
}
