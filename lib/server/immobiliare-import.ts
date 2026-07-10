import type { CityListingsCache, ListingDetail, MapListing } from "@/lib/types";
import {
  extractImmobiliareListingId,
  normalizeImmobiliareListingUrl,
} from "@/lib/listing-url";
import { geocodeCity, normalizeCitySlug } from "./geocode";
import { saveCache } from "./listings-cache";
import { savePropertyDetailCache } from "./property-detail-cache";
import {
  ImmobiliareBrowserError,
  fetchImmobiliareListingHtml,
  isPlaywrightAvailable,
} from "./immobiliare-browser";
import {
  ImmobiliareScrapeError,
  isImmobiliareCaptchaPage,
  parseImmobiliareHtml,
} from "./immobiliare-scraper";
import type { ListingsProvider } from "@/lib/types";

export class ImmobiliareImportError extends Error {}

function cityHintFromAddress(address: string | null): string {
  if (!address) return "import";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? parts[0] ?? "import";
}

async function ensureCoordinates(detail: ListingDetail): Promise<ListingDetail> {
  if (detail.lat !== 0 && detail.lng !== 0) return detail;
  const city = cityHintFromAddress(detail.address);
  if (city === "import") return detail;
  try {
    const geo = await geocodeCity(city);
    return { ...detail, lat: geo.lat, lng: geo.lng };
  } catch {
    return detail;
  }
}

async function toCityListingsCache(
  detail: ListingDetail,
  provider: ListingsProvider,
): Promise<CityListingsCache> {
  const located = await ensureCoordinates(detail);
  const city = cityHintFromAddress(located.address);
  let center = {
    lat: located.lat,
    lng: located.lng,
    display_name: located.address,
  };

  if (located.lat === 0 && located.lng === 0 && city !== "import") {
    try {
      const geo = await geocodeCity(city);
      center = { lat: geo.lat, lng: geo.lng, display_name: geo.display_name ?? located.address };
    } catch {
      /* keep defaults */
    }
  }

  const listing: MapListing = {
    id: located.id,
    title: located.title,
    price: located.price,
    operation: located.operation,
    url: located.url,
    lat: located.lat,
    lng: located.lng,
    sqm: located.sqm,
    rooms: located.rooms,
    address: located.address,
    property_type: located.property_type,
    property_type_label: located.property_type_label,
    condition_status: located.condition_status,
    condition: located.condition,
    needs_renovation: located.needs_renovation,
    listing_published_at: located.listing_published_at ?? null,
    listing_updated_at: located.listing_updated_at ?? null,
  };

  return {
    city: normalizeCitySlug(city),
    operation: located.operation,
    fetched_at: new Date().toISOString(),
    center,
    listings: [listing],
    provider,
  };
}

async function fetchImmobiliareHtmlDirect(url: string): Promise<string> {
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

  if (!response.ok) {
    throw new ImmobiliareImportError(`Pagina Immobiliare non accessibile (${response.status})`);
  }

  return response.text();
}

export async function fetchImmobiliareListingDetail(url: string): Promise<ListingDetail> {
  const normalized = normalizeImmobiliareListingUrl(url);
  const numericId = extractImmobiliareListingId(normalized);
  if (!numericId) throw new ImmobiliareImportError("ID annuncio non trovato nell'URL");

  let html: string | null = null;

  try {
    const directHtml = await fetchImmobiliareHtmlDirect(normalized);
    if (!isImmobiliareCaptchaPage(directHtml)) {
      html = directHtml;
    }
  } catch {
    /* try playwright */
  }

  if (!html) {
    if (!(await isPlaywrightAvailable())) {
      throw new ImmobiliareImportError(
        "Immobiliare ha bloccato la richiesta diretta. Installa Playwright: npx playwright install chromium",
      );
    }
    try {
      html = await fetchImmobiliareListingHtml(normalized);
    } catch (err) {
      if (err instanceof ImmobiliareBrowserError) {
        throw new ImmobiliareImportError(err.message);
      }
      throw err;
    }
  }

  let detail: ListingDetail;
  try {
    detail = parseImmobiliareHtml(html, normalized, numericId);
  } catch (err) {
    if (err instanceof ImmobiliareScrapeError) {
      throw new ImmobiliareImportError(err.message);
    }
    throw err;
  }

  if (detail.price <= 0) {
    throw new ImmobiliareImportError("Impossibile estrarre il prezzo dall'annuncio Immobiliare");
  }

  return ensureCoordinates(detail);
}

export async function importImmobiliareListingFromUrl(url: string): Promise<CityListingsCache> {
  try {
    const detail = await fetchImmobiliareListingDetail(url);
    await savePropertyDetailCache(detail);
    const cache = await toCityListingsCache(detail, "direct");
    await saveCache(cache);
    return cache;
  } catch (err) {
    if (err instanceof ImmobiliareImportError) throw err;
    if (err instanceof Error) throw new ImmobiliareImportError(err.message);
    throw new ImmobiliareImportError("Importazione Immobiliare non riuscita.");
  }
}

export { parseImmobiliareHtml as parseListingFromHtml };
