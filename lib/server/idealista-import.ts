import * as cheerio from "cheerio";
import type { CityListingsCache, ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import { normalizeIdealistaListingUrl } from "@/lib/listing-url";
import { geocodeCity, normalizeCitySlug } from "./geocode";
import { saveCache } from "./listings-cache";
import { listingToDetail } from "./property-detail";
import { savePropertyDetailCache } from "./property-detail-cache";
import { withIdealistaBrowser } from "./idealista-browser";

export class IdealistaImportError extends Error {}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const cleaned = String(raw).replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? null : n;
}

function detectOperation(html: string, url: string): "sale" | "rent" {
  const lower = html.toLowerCase();
  if (url.toLowerCase().includes("affitto")) return "rent";
  if (lower.includes('"operation":"rent"') || lower.includes('"operation":"alquiler"')) return "rent";
  if (lower.includes("affitto") && !lower.includes("vendita")) return "rent";
  return "sale";
}

function cityHintFromAddress(address: string | null): string {
  if (!address) return "import";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? parts[0] ?? "import";
}

function extractFromEmbeddedJson(html: string, sourceUrl: string): Partial<MapListing> | null {
  const idMatch = sourceUrl.match(/\/immobile\/(\d+)/);
  const id = idMatch?.[1];
  if (!id || !html.includes(id)) return null;

  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m?.[1] ?? null;
  };

  const priceRaw =
    pick(new RegExp(`"propertyCode"\\s*:\\s*${id}[\\s\\S]{0,4000}?"price"\\s*:\\s*(\\d+)`)) ??
    pick(/"price"\s*:\s*(\d+)/);
  const latRaw = pick(new RegExp(`"propertyCode"\\s*:\\s*${id}[\\s\\S]{0,4000}?"latitude"\\s*:\\s*([\\d.-]+)`)) ??
    pick(/"latitude"\s*:\s*([\d.-]+)/);
  const lngRaw = pick(new RegExp(`"propertyCode"\\s*:\\s*${id}[\\s\\S]{0,4000}?"longitude"\\s*:\\s*([\\d.-]+)`)) ??
    pick(/"longitude"\s*:\s*([\d.-]+)/);
  const sizeRaw = pick(/"size"\s*:\s*(\d+)/);
  const roomsRaw = pick(/"rooms"\s*:\s*(\d+)/);
  const addressRaw = pick(/"address"\s*:\s*"([^"]+)"/);

  const price = parsePrice(priceRaw);
  if (price == null) return null;

  return {
    id,
    price,
    lat: latRaw ? parseFloat(latRaw) : 0,
    lng: lngRaw ? parseFloat(lngRaw) : 0,
    sqm: sizeRaw ? parseInt(sizeRaw, 10) : null,
    rooms: roomsRaw ? parseInt(roomsRaw, 10) : null,
    address: addressRaw?.replace(/\\u[\dA-Fa-f]{4}/g, (m) =>
      String.fromCharCode(parseInt(m.slice(2), 16)),
    ) ?? null,
  };
}

function parsePropertyDetailHtml(html: string, sourceUrl: string): MapListing {
  const normalized = normalizeIdealistaListingUrl(sourceUrl);
  const idMatch = normalized.match(/\/immobile\/(\d+)/);
  const id = idMatch?.[1];
  if (!id) throw new IdealistaImportError("ID annuncio non trovato nell'URL");

  const embedded = extractFromEmbeddedJson(html, normalized);
  const $ = cheerio.load(html);
  const operation = detectOperation(html, normalized);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    embedded?.address ||
    `Immobile ${id}`;

  const price =
    embedded?.price ??
    parsePrice($(".info-data-price span").first().text()) ??
    parsePrice(html.match(/info-data-price[\s\S]{0,120}?([\d.,]+)/i)?.[1]) ??
    parsePrice(html.match(/"price"\s*:\s*(\d+)/)?.[1]);

  if (price == null) {
    throw new IdealistaImportError("Prezzo non trovato nella pagina");
  }

  const sqm =
    embedded?.sqm ??
    (() => {
      const m = html.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
      return m ? parseFloat(m[1].replace(",", ".")) : null;
    })();

  const rooms =
    embedded?.rooms ??
    (() => {
      const m = html.match(/(\d+)\s*(?:locali|camere)/i);
      return m ? parseInt(m[1], 10) : null;
    })();

  const address = embedded?.address ?? title;
  const lat = embedded?.lat ?? 0;
  const lng = embedded?.lng ?? 0;

  return {
    id,
    title: title.slice(0, 200),
    price,
    operation,
    url: normalized,
    lat,
    lng,
    sqm,
    rooms,
    address: address.slice(0, 200),
    property_type: null,
    property_type_label: null,
    condition_status: null,
    condition: null,
    needs_renovation: null,
  };
}

async function ensureCoordinates(listing: MapListing): Promise<MapListing> {
  if (listing.lat !== 0 && listing.lng !== 0) return listing;

  const city = cityHintFromAddress(listing.address);
  if (city === "import") return listing;

  try {
    const geo = await geocodeCity(city);
    return { ...listing, lat: geo.lat, lng: geo.lng };
  } catch {
    return listing;
  }
}

export async function fetchPropertyDetailsViaScrape(url: string): Promise<MapListing> {
  const normalized = normalizeIdealistaListingUrl(url);
  const html = await withIdealistaBrowser(async (session) =>
    session.fetchHtml(normalized, { forceNavigation: true }),
  );
  const listing = parsePropertyDetailHtml(html, normalized);
  return ensureCoordinates(listing);
}

async function toCityListingsCache(
  listing: MapListing,
  provider: ListingsProvider,
): Promise<CityListingsCache> {
  const located = await ensureCoordinates(listing);
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

  return {
    city: normalizeCitySlug(city),
    operation: located.operation,
    fetched_at: new Date().toISOString(),
    center,
    listings: [located],
    provider,
  };
}

export async function importListingFromUrl(url: string): Promise<CityListingsCache> {
  try {
    const fetched = await fetchPropertyDetailsViaScrape(url);
    const detail: ListingDetail = listingToDetail(fetched);
    await savePropertyDetailCache(detail);
    const cache = await toCityListingsCache(fetched, "direct");
    await saveCache(cache);
    return cache;
  } catch (err) {
    if (err instanceof IdealistaImportError) throw err;
    if (err instanceof Error) throw new IdealistaImportError(err.message);
    throw new IdealistaImportError("Importazione Idealista non riuscita.");
  }
}
