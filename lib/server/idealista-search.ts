import * as cheerio from "cheerio";
import type { CityListingsCache, ListingsProvider, MapListing } from "@/lib/types";
import { resolveListingCondition } from "@/lib/renovation-status";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { citySlugVariants, geocodeCity, normalizeCitySlug } from "./geocode";
import { fetchCityListingsViaRapidApi } from "./rapidapi-idealista";
import { fetchCityListingsViaDirect } from "./idealista-direct";
import { fetchUrl } from "./scrapingbee";

const IDEALISTA_BASE = "https://www.idealista.it";

export class IdealistaSearchError extends Error {}

export function buildIdealistaSearchUrl(
  slug: string,
  operation: "sale" | "rent",
  mapView: boolean,
  page = 1,
): string {
  const segment = operation === "sale" ? "vendita-case" : "affitto-case";
  let path = `${IDEALISTA_BASE}/cerca/${segment}/${slug}`;
  if (mapView) path += "/lista-mappa";
  path += "/";
  if (page > 1) path += `pagina-${page}.htm`;
  return path;
}

function mergeListingMaps(existing: MapListing[], incoming: MapListing[]): MapListing[] {
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const listing of incoming) byId.set(listing.id, listing);
  return [...byId.values()];
}

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

function listingFromDict(item: Record<string, unknown>, operation: "sale" | "rent"): MapListing | null {
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng ?? item.lon;
  if (lat == null || lng == null) return null;

  let id = String(item.adId ?? item.id ?? item.propertyCode ?? "");
  if (!id) {
    const url = String(item.url ?? item.detailUrl ?? "");
    const match = url.match(/\/immobile\/(\d+)/);
    if (match) id = match[1];
  }
  if (!id) return null;

  let url = String(item.url ?? item.detailUrl ?? `${IDEALISTA_BASE}/immobile/${id}/`);
  if (url.startsWith("/")) url = `${IDEALISTA_BASE}${url}`;

  const price = parsePrice(item.price ?? item.priceValue ?? item.amount);
  if (price == null) return null;

  const title = String(
    item.title ?? item.propertyTitle ?? item.address ?? `Immobile ${id}`,
  );

  const status = item.status ?? item.propertyStatus ?? item.conservation;
  const conditionInfo = resolveListingCondition(
    status != null ? String(status) : null,
    title,
  );

  const sqmRaw = item.size ?? item.sqm ?? item.surface;
  const sqm = sqmRaw != null ? Number(sqmRaw) : null;

  const roomsRaw = item.rooms ?? item.roomNumber;
  const rooms = roomsRaw != null ? Number(roomsRaw) : null;

  return {
    id,
    title,
    price,
    operation,
    url,
    lat: Number(lat),
    lng: Number(lng),
    sqm: sqm != null && !Number.isNaN(sqm) ? sqm : null,
    rooms: rooms != null && !Number.isNaN(rooms) ? rooms : null,
    address: item.address ? String(item.address) : item.street ? String(item.street) : null,
    property_type: null,
    property_type_label: null,
    ...conditionInfo,
  };
}

function extractJsonCandidates(html: string): unknown[] {
  const candidates: unknown[] = [];
  const keys = ["adMapMarkers", "mapMarkers", "markers", "ads", "items", "listings"];

  for (const key of keys) {
    if (!html.includes(key)) continue;
    const arrayRe = new RegExp(`"${key}"\\s*:\\s*(\\[[\\s\\S]*?\\])`, "g");
    for (const match of html.matchAll(arrayRe)) {
      try {
        candidates.push(JSON.parse(match[1]));
      } catch {
        /* skip */
      }
    }
  }

  const latArrayRe = /\[\s*\{[^\]]*"latitude"[^\]]*\}\s*\]/g;
  for (const match of html.matchAll(latArrayRe)) {
    try {
      candidates.push(JSON.parse(match[0]));
    } catch {
      /* skip */
    }
  }

  return candidates;
}

function parseEmbeddedMarkers(html: string, operation: "sale" | "rent"): MapListing[] {
  const listings: MapListing[] = [];
  const seen = new Set<string>();

  for (const candidate of extractJsonCandidates(html)) {
    const items = Array.isArray(candidate) ? candidate : [candidate];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const listing = listingFromDict(item as Record<string, unknown>, operation);
      if (listing && !seen.has(listing.id)) {
        seen.add(listing.id);
        listings.push(listing);
      }
    }
  }

  return listings;
}

export function parseListingCards(html: string, operation: "sale" | "rent"): MapListing[] {
  const $ = cheerio.load(html);
  const listings: MapListing[] = [];
  const seen = new Set<string>();

  $("a[href*='/immobile/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/\/immobile\/(\d+)/);
    if (!match) return;
    const id = match[1];
    if (seen.has(id)) return;

    const title = $(el).text().replace(/\s+/g, " ").trim() || `Immobile ${id}`;
    const card = $(el).closest("article, [class*='item']");
    const cardText = card.length ? card.text().replace(/\s+/g, " ") : title;

    const price = parsePrice(cardText.match(/[\d.,]+\s*€/)?.[0]);
    if (price == null) return;

    let sqm: number | null = null;
    const sqmMatch = cardText.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
    if (sqmMatch) sqm = parseFloat(sqmMatch[1].replace(",", "."));

    let rooms: number | null = null;
    const roomsMatch = cardText.match(/(\d+)\s*(?:locali|camere)/i);
    if (roomsMatch) rooms = parseInt(roomsMatch[1], 10);

    const url = href.startsWith("http") ? href : `${IDEALISTA_BASE}${href}`;
    seen.add(id);
    const conditionInfo = resolveListingCondition(null, cardText);
    listings.push({
      id,
      title: title.slice(0, 200),
      price,
      operation,
      url,
      lat: 0,
      lng: 0,
      sqm,
      rooms,
      address: null,
      property_type: null,
      property_type_label: null,
      ...conditionInfo,
    });
  });

  return listings;
}

export function parseMapSearchHtml(html: string, operation: "sale" | "rent"): MapListing[] {
  const markers = parseEmbeddedMarkers(html, operation);
  if (markers.length) return markers;
  return parseListingCards(html, operation).filter((l) => l.lat !== 0 || l.lng !== 0);
}

export async function fetchCityListings(
  city: string,
  operation: "sale" | "rent",
  provider: ListingsProvider = "scrapingbee",
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  if (provider === "rapidapi") {
    return fetchCityListingsViaRapidApi(city, operation, maxPages, onPage);
  }
  if (provider === "direct") {
    return fetchCityListingsViaDirect(city, operation, maxPages, onPage);
  }
  return fetchCityListingsViaScrapingBee(city, operation, maxPages, onPage);
}

async function fetchCityListingsViaScrapingBee(
  city: string,
  operation: "sale" | "rent",
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
): Promise<CityListingsCache> {
  const centerData = await geocodeCity(city);
  let listings: MapListing[] = [];
  let lastError: unknown;

  for (const slug of citySlugVariants(city)) {
    for (let page = 1; page <= maxPages; page++) {
      const beforeCount = listings.length;
      for (const mapView of [true, false]) {
        try {
          const html = await fetchUrl(buildIdealistaSearchUrl(slug, operation, mapView, page));
          const pageListings = parseMapSearchHtml(html, operation);
          if (pageListings.length) {
            listings = mergeListingMaps(listings, pageListings);
            break;
          }
          const cards = parseListingCards(html, operation);
          if (cards.length) {
            listings = mergeListingMaps(listings, cards);
            break;
          }
        } catch (err) {
          lastError = err;
        }
      }
      if (listings.length === beforeCount) break;
      onPage?.({
        operation,
        page,
        maxPages,
        listingsTotal: listings.length,
      });
    }
    if (listings.length) break;
  }

  if (!listings.length) {
    if (lastError) throw new IdealistaSearchError(`Impossibile recuperare annunci: ${lastError}`);
    throw new IdealistaSearchError(`Nessun annuncio trovato per ${city}`);
  }

  return {
    city: normalizeCitySlug(city),
    operation,
    fetched_at: new Date().toISOString(),
    center: {
      lat: centerData.lat,
      lng: centerData.lng,
      display_name: centerData.display_name ?? null,
    },
    listings,
  };
}
