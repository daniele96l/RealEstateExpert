import * as cheerio from "cheerio";
import type { CityListingsCache, ListingDetail, MapListing } from "@/lib/types";
import {
  extractImmobiliareListingId,
  immobiliareListingCacheId,
  normalizeImmobiliareListingUrl,
} from "@/lib/listing-url";
import { resolvePropertyCondition } from "@/lib/property-condition";
import { geocodeCity, normalizeCitySlug } from "./geocode";
import { saveCache } from "./listings-cache";
import { listingToDetail } from "./property-detail";
import { savePropertyDetailCache } from "./property-detail-cache";
import { fetchUrl, ScrapingBeeError } from "./scrapingbee";
import type { ListingsProvider } from "@/lib/types";

export class ImmobiliareImportError extends Error {}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && raw > 0) return raw;
  const cleaned = String(raw).replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function findRealEstateNode(data: unknown, listingId: string): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRealEstateNode(item, listingId);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  const nested = asRecord(obj.realEstate);
  if (nested && String(nested.id) === listingId) return nested;

  if (String(obj.id) === listingId && (obj.price != null || obj.prices != null || obj.properties != null)) {
    return obj;
  }

  for (const value of Object.values(obj)) {
    const found = findRealEstateNode(value, listingId);
    if (found) return found;
  }
  return null;
}

function extractNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractJsonLdListing(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  let result: Record<string, unknown> | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    try {
      const parsed = JSON.parse($(el).text()) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const obj = asRecord(item);
        if (!obj) continue;
        const type = String(obj["@type"] ?? "");
        if (type.includes("RealEstateListing") || type.includes("Apartment") || type.includes("House")) {
          result = obj;
          return false;
        }
      }
    } catch {
      /* ignore */
    }
  });
  return result;
}

function operationFromText(...parts: Array<string | null | undefined>): "sale" | "rent" {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (text.includes("affitto") || text.includes("rent")) return "rent";
  return "sale";
}

function cityHintFromAddress(address: string | null): string {
  if (!address) return "import";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? parts[0] ?? "import";
}

function mapRealEstateToListing(
  re: Record<string, unknown>,
  url: string,
  numericId: string,
): MapListing {
  const priceObj = asRecord(re.price) ?? asRecord(re.prices);
  const price =
    parsePrice(re.price) ??
    parsePrice(priceObj?.value) ??
    parsePrice(priceObj?.price) ??
    parsePrice(priceObj?.amount) ??
    0;

  const geo =
    asRecord(re.geo) ??
    asRecord(re.geolocation) ??
    asRecord(re.location) ??
    asRecord(re.ubication);

  const lat = Number(geo?.latitude ?? geo?.lat ?? re.latitude ?? 0);
  const lng = Number(geo?.longitude ?? geo?.lng ?? re.longitude ?? 0);

  const title = String(
    re.title ?? re.shortDescription ?? re.heading ?? re.name ?? `Annuncio ${numericId}`,
  ).slice(0, 200);

  const addressRaw =
    geo?.address ??
    geo?.label ??
    geo?.streetAddress ??
    re.address ??
    re.macrozone ??
    re.city;
  const address = addressRaw ? String(addressRaw).slice(0, 200) : null;

  const sqm =
    parsePrice(re.surface) ??
    parsePrice(re.sqm) ??
    parsePrice(re.squareMeters) ??
    parsePrice(re.livingSurface);

  const rooms =
    parsePrice(re.rooms) ??
    parsePrice(re.roomNumber) ??
    parsePrice(re.numberOfRooms);

  const conditionText = [
    re.condition,
    re.state,
    re.energyClass,
    re.description,
    re.title,
  ]
    .filter((value) => typeof value === "string")
    .join(" ");
  const conditionInfo = resolvePropertyCondition(null, conditionText);

  const propertyType = String(re.typology ?? re.propertyType ?? re.category ?? "").trim() || null;

  return {
    id: immobiliareListingCacheId(numericId),
    title,
    price,
    operation: operationFromText(
      String(re.contract ?? ""),
      String(re.contractType ?? ""),
      String(re.typologyContract ?? ""),
      url,
      title,
    ),
    url,
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    sqm: sqm != null ? Math.round(sqm) : null,
    rooms: rooms != null ? Math.round(rooms) : null,
    address,
    property_type: propertyType,
    property_type_label: propertyType,
    ...conditionInfo,
  };
}

function mapJsonLdToListing(
  jsonLd: Record<string, unknown>,
  url: string,
  numericId: string,
): MapListing {
  const offers = asRecord(jsonLd.offers);
  const geo = asRecord(jsonLd.geo);
  const price = parsePrice(offers?.price) ?? parsePrice(jsonLd.price) ?? 0;
  const title = String(jsonLd.name ?? `Annuncio ${numericId}`).slice(0, 200);
  const address = jsonLd.address ? String(jsonLd.address).slice(0, 200) : null;
  const conditionInfo = resolvePropertyCondition(null, title);

  return {
    id: immobiliareListingCacheId(numericId),
    title,
    price,
    operation: operationFromText(String(offers?.businessFunction ?? ""), url, title),
    url,
    lat: Number(geo?.latitude ?? 0),
    lng: Number(geo?.longitude ?? 0),
    sqm: null,
    rooms: null,
    address,
    property_type: null,
    property_type_label: null,
    ...conditionInfo,
  };
}

function parseListingFromHtml(html: string, url: string, numericId: string): MapListing {
  const nextData = extractNextData(html);
  if (nextData) {
    const pageProps = asRecord(asRecord(nextData)?.props)?.pageProps;
    const realEstate = findRealEstateNode(pageProps ?? nextData, numericId);
    if (realEstate) return mapRealEstateToListing(realEstate, url, numericId);
  }

  const jsonLd = extractJsonLdListing(html);
  if (jsonLd) return mapJsonLdToListing(jsonLd, url, numericId);

  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    `Annuncio ${numericId}`;

  const price =
    parsePrice($('[class*="price"], [data-cy="price"]').first().text()) ??
    parsePrice(html.match(/"price"\s*:\s*(\d+)/)?.[1]) ??
    parsePrice(html.match(/€\s*([\d.]+)/)?.[1]);

  if (price == null) {
    throw new ImmobiliareImportError("Prezzo non trovato nella pagina Immobiliare");
  }

  const sqmMatch = html.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  const roomsMatch = html.match(/(\d+)\s*locali/i);
  const latMatch = html.match(/"latitude"\s*:\s*([\d.-]+)/);
  const lngMatch = html.match(/"longitude"\s*:\s*([\d.-]+)/);
  const conditionInfo = resolvePropertyCondition(null, title);

  return {
    id: immobiliareListingCacheId(numericId),
    title: title.slice(0, 200),
    price,
    operation: operationFromText(url, title, html),
    url,
    lat: latMatch ? parseFloat(latMatch[1]) : 0,
    lng: lngMatch ? parseFloat(lngMatch[1]) : 0,
    sqm: sqmMatch ? parseFloat(sqmMatch[1].replace(",", ".")) : null,
    rooms: roomsMatch ? parseInt(roomsMatch[1], 10) : null,
    address: title.slice(0, 200),
    property_type: null,
    property_type_label: null,
    ...conditionInfo,
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

export async function fetchImmobiliareListingViaScrapingBee(url: string): Promise<MapListing> {
  const normalized = normalizeImmobiliareListingUrl(url);
  const numericId = extractImmobiliareListingId(normalized);
  if (!numericId) throw new ImmobiliareImportError("ID annuncio non trovato nell'URL");

  const html = await fetchUrl(normalized);
  if (!html.includes("__NEXT_DATA__") && html.includes("captcha-delivery.com")) {
    throw new ImmobiliareImportError("Immobiliare ha bloccato la richiesta. Riprova più tardi.");
  }

  const listing = parseListingFromHtml(html, normalized, numericId);
  if (listing.price <= 0) {
    throw new ImmobiliareImportError("Impossibile estrarre il prezzo dall'annuncio Immobiliare");
  }
  return ensureCoordinates(listing);
}

export async function importImmobiliareListingFromUrl(
  url: string,
  hasScrapingBee: boolean,
): Promise<CityListingsCache> {
  if (!hasScrapingBee) {
    throw new ImmobiliareImportError(
      "Importazione Immobiliare richiede SCRAPINGBEE_API_KEY in .env.local",
    );
  }

  try {
    const listing = await fetchImmobiliareListingViaScrapingBee(url);
    const detail: ListingDetail = listingToDetail(listing);
    await savePropertyDetailCache(detail);
    const cache = await toCityListingsCache(listing, "scrapingbee");
    await saveCache(cache);
    return cache;
  } catch (err) {
    if (err instanceof ScrapingBeeError) throw new ImmobiliareImportError(err.message);
    throw err;
  }
}

export { parseListingFromHtml };
