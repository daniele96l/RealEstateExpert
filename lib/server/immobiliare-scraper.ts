import * as cheerio from "cheerio";
import { immobiliareListingCacheId } from "@/lib/listing-url";
import { resolvePropertyCondition } from "@/lib/property-condition";
import type { ListingDetail } from "@/lib/types";
import { normalizeEnergyClass } from "./property-detail";

export class ImmobiliareScrapeError extends Error {}

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

export function findRealEstateNode(data: unknown, listingId: string): Record<string, unknown> | null {
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

export function extractNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function isImmobiliareCaptchaPage(html: string): boolean {
  if (html.includes("__NEXT_DATA__")) return false;
  return (
    html.includes("captcha-delivery.com") ||
    /accesso\s+è\s+temporaneamente\s+limitato/i.test(html) ||
    /accesso\s+temporaneamente\s+limitato/i.test(html) ||
    html.includes("Please enable JS and disable any ad blocker")
  );
}

export function immobiliareBlockReason(html: string): string | null {
  if (!isImmobiliareCaptchaPage(html) && html.includes("__NEXT_DATA__")) return null;
  if (/temporaneamente\s+limitato/i.test(html)) {
    return "IP temporaneamente bloccato da Immobiliare (DataDome). Attendi 24–48 ore o usa un'altra rete (hotspot/VPN). Evita di rilanciare lo scraper finché il sito non si apre nel browser normale.";
  }
  if (html.includes("captcha-delivery.com")) {
    return "Captcha DataDome attivo. Apri immobiliare.it nel browser normale (Safari/Chrome, non Playwright) e verifica che funzioni prima di riscrapare.";
  }
  return "Accesso a Immobiliare bloccato.";
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

function normalizePropertyKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function buildPropertiesMap(re: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  const raw = re.properties ?? re.features ?? re.characteristics;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const obj = asRecord(item);
      if (!obj) continue;
      const label = String(obj.label ?? obj.name ?? obj.key ?? obj.type ?? "").trim();
      const value = String(obj.value ?? obj.text ?? obj.content ?? obj.val ?? "").trim();
      if (label && value) map.set(normalizePropertyKey(label), value);
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value != null && typeof value !== "object") {
        map.set(normalizePropertyKey(key), String(value));
      }
    }
  }
  return map;
}

function propertyValue(map: Map<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = map.get(normalizePropertyKey(key));
    if (value) return value;
  }
  return null;
}

function mainProperty(re: Record<string, unknown>): Record<string, unknown> | null {
  if (Array.isArray(re.properties) && re.properties.length > 0) {
    return asRecord(re.properties[0]);
  }
  return null;
}

function parseSurface(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw > 0 ? raw : null;
  const m = String(raw).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parsePrice(m[1]) : null;
}

function extractImages(re: Record<string, unknown>): string[] {
  const urls = new Set<string>();

  const addPhoto = (photo: unknown) => {
    const obj = asRecord(photo);
    if (!obj) return;
    const candidates = [
      obj.url,
      obj.src,
      obj.href,
      asRecord(obj.urls)?.large,
      asRecord(obj.urls)?.medium,
      asRecord(obj.urls)?.small,
      asRecord(obj.url)?.large,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.startsWith("http")) urls.add(c);
    }
  };

  const main = mainProperty(re);
  const multimedia = asRecord(main?.multimedia) ?? asRecord(re.multimedia) ?? asRecord(re.media);
  const collections = [
    multimedia?.photos,
    multimedia?.images,
    re.photos,
    re.images,
    re.pictures,
  ];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const photo of collection) addPhoto(photo);
  }

  const cover = asRecord(main?.photo);
  if (cover) addPhoto(cover);

  return [...urls].slice(0, 20);
}

function extractDescription(re: Record<string, unknown>): string | null {
  const main = mainProperty(re);
  const fromMain = main?.description;
  if (typeof fromMain === "string" && fromMain.trim()) {
    return fromMain.trim().slice(0, 5000);
  }
  if (typeof re.description === "string" && re.description.trim()) {
    return re.description.trim().slice(0, 5000);
  }
  if (Array.isArray(re.descriptions)) {
    for (const item of re.descriptions) {
      const obj = asRecord(item);
      const text = obj?.text ?? obj?.value ?? obj?.description;
      if (typeof text === "string" && text.trim()) return text.trim().slice(0, 5000);
    }
  }
  return null;
}

function extractBuiltYear(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/(?:costruito|costruzione|edificio|anno)[\s\S]{0,40}?(\d{4})/i);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 1800 && y <= new Date().getFullYear()) return y;
  }
  return null;
}

function boolFromText(value: string | null): boolean | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (/(si|sì|yes|presente|true)/i.test(lower)) return true;
  if (/(no|assente|false)/i.test(lower)) return false;
  return null;
}

export function mapRealEstateToDetail(
  re: Record<string, unknown>,
  url: string,
  numericId: string,
): ListingDetail {
  const main = mainProperty(re);
  const props = buildPropertiesMap(re);
  const priceObj = asRecord(re.price) ?? asRecord(re.prices);
  const price =
    parsePrice(priceObj?.value) ??
    parsePrice(re.price) ??
    parsePrice(priceObj?.price) ??
    parsePrice(priceObj?.amount) ??
    parsePrice(re.priceFormatted) ??
    0;

  const location =
    asRecord(main?.location) ??
    asRecord(re.geo) ??
    asRecord(re.geolocation) ??
    asRecord(re.location) ??
    asRecord(re.ubication);

  const lat = Number(location?.latitude ?? location?.lat ?? re.latitude ?? re.lat ?? 0);
  const lng = Number(location?.longitude ?? location?.lng ?? re.longitude ?? re.lng ?? 0);

  const title = String(
    re.title ?? re.shortDescription ?? re.heading ?? re.name ?? `Annuncio ${numericId}`,
  ).slice(0, 200);

  const addressRaw =
    location?.address ??
    location?.label ??
    location?.streetAddress ??
    re.address ??
    location?.macrozone ??
    location?.city ??
    re.macrozone ??
    re.city;
  const address = addressRaw ? String(addressRaw).slice(0, 200) : null;

  const sqm =
    parseSurface(main?.surface) ??
    parsePrice(main?.surface_value) ??
    parsePrice(re.surface) ??
    parsePrice(re.sqm) ??
    parsePrice(re.squareMeters) ??
    parsePrice(re.livingSurface) ??
    parsePrice(re.superficie) ??
    parsePrice(propertyValue(props, "superficie", "surface"));

  const rooms =
    parsePrice(main?.rooms) ??
    parsePrice(re.rooms) ??
    parsePrice(re.roomNumber) ??
    parsePrice(re.numberOfRooms) ??
    parsePrice(propertyValue(props, "locali", "rooms"));

  const bathrooms =
    parsePrice(main?.bathrooms) ??
    parsePrice(main?.ga4Bathrooms) ??
    parsePrice(re.bathrooms) ??
    parsePrice(re.bathNumber) ??
    parsePrice(propertyValue(props, "bagni", "bathrooms"));

  const floorObj = asRecord(main?.floor);
  const floor =
    floorObj?.value != null
      ? String(floorObj.value)
      : re.floor != null
        ? String(re.floor)
        : propertyValue(props, "piano", "floor");

  const energyObj = asRecord(main?.energy);
  const energyRaw = String(
    energyObj?.certificate ?? re.energyClass ?? re.energy_class ?? propertyValue(props, "classe_energetica", "classe energetica") ?? "",
  );
  const energyClass = normalizeEnergyClass(energyRaw.replace(/[^A-G0-9]/gi, "").slice(0, 2) || energyRaw);

  const energyKwh =
    parsePrice(energyObj?.performance) ??
    parsePrice(re.energyPerformance) ??
    parsePrice(re.energy_kwh_sqm) ??
    parsePrice(propertyValue(props, "ipe", "epglnren"));

  const description = extractDescription(re);
  const images = extractImages(re);

  const typology = asRecord(re.typology);
  const propertyType =
    String(typology?.name ?? re.typology ?? re.propertyType ?? re.category ?? "").trim() || null;
  const zone = String(location?.macrozone ?? re.macrozone ?? re.zone ?? "").trim() || null;
  const cityLabel = String(location?.city ?? location?.province ?? re.city ?? "").trim() || null;

  const condominio =
    parsePrice(re.condominiumExpenses) ??
    parsePrice(re.communityCosts) ??
    parsePrice(propertyValue(props, "spese_condominiali", "spese condominiali"));

  const furnished = propertyValue(props, "arredato", "furnished");
  const lift =
    boolFromText(propertyValue(props, "ascensore", "lift")) ??
    (main?.elevator === true || main?.hasElevators === true ? true : null);
  const garden = boolFromText(propertyValue(props, "giardino", "garden"));
  const terrace = boolFromText(propertyValue(props, "terrazzo", "balcone", "terrace"));
  const garage = boolFromText(propertyValue(props, "box_auto", "garage", "posto_auto"));

  const conditionText = [
    main?.condition,
    main?.ga4Condition,
    re.condition,
    re.state,
    re.energyClass,
    propertyValue(props, "stato", "condition"),
    description,
    title,
  ]
    .filter((value) => typeof value === "string")
    .join(" ");
  const conditionInfo = resolvePropertyCondition(
    typeof main?.condition === "string"
      ? main.condition
      : typeof re.condition === "string"
        ? re.condition
        : null,
    conditionText,
  );

  const operation = operationFromText(
    String(re.contract ?? ""),
    String(re.contractType ?? ""),
    String(re.typologyContract ?? ""),
    url,
    title,
  );

  return {
    id: immobiliareListingCacheId(numericId),
    title,
    price,
    operation,
    url,
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    sqm: sqm != null ? Math.round(sqm) : null,
    rooms: rooms != null ? Math.round(rooms) : null,
    address,
    property_type: propertyType,
    property_type_label: propertyType,
    condition_status: conditionInfo.condition_status,
    condition: conditionInfo.condition,
    needs_renovation: conditionInfo.needs_renovation,
    bathrooms: bathrooms != null ? Math.round(bathrooms) : null,
    floor: floor ?? null,
    energy_class: energyClass,
    energy_kwh_sqm: energyKwh != null ? Math.round(energyKwh) : null,
    zone,
    city_label: cityLabel,
    price_per_sqm: sqm ? Math.round(price / sqm) : null,
    condominio_monthly: condominio,
    lift,
    garden,
    terrace,
    garage,
    furnished,
    built_year: extractBuiltYear(description),
    description,
    images,
    fetched_at: new Date().toISOString(),
  };
}

function mapJsonLdToDetail(
  jsonLd: Record<string, unknown>,
  url: string,
  numericId: string,
): ListingDetail {
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
    condition_status: conditionInfo.condition_status,
    condition: conditionInfo.condition,
    needs_renovation: conditionInfo.needs_renovation,
    bathrooms: null,
    floor: null,
    energy_class: null,
    energy_kwh_sqm: null,
    zone: null,
    city_label: null,
    price_per_sqm: null,
    condominio_monthly: null,
    lift: null,
    garden: null,
    terrace: null,
    garage: null,
    furnished: null,
    built_year: null,
    description: typeof jsonLd.description === "string" ? jsonLd.description : null,
    images: [],
    fetched_at: new Date().toISOString(),
  };
}

export function parseImmobiliareHtml(html: string, url: string, numericId: string): ListingDetail {
  const nextData = extractNextData(html);
  if (nextData) {
    const pageProps = asRecord(asRecord(nextData)?.props)?.pageProps;
    const realEstate = findRealEstateNode(pageProps ?? nextData, numericId);
    if (realEstate) return mapRealEstateToDetail(realEstate, url, numericId);
  }

  const jsonLd = extractJsonLdListing(html);
  if (jsonLd) return mapJsonLdToDetail(jsonLd, url, numericId);

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
    throw new ImmobiliareScrapeError("Prezzo non trovato nella pagina Immobiliare");
  }

  const sqmMatch = html.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  const roomsMatch = html.match(/(\d+)\s*locali/i);
  const latMatch = html.match(/"latitude"\s*:\s*([\d.-]+)/);
  const lngMatch = html.match(/"longitude"\s*:\s*([\d.-]+)/);
  const conditionInfo = resolvePropertyCondition(null, title);
  const sqm = sqmMatch ? parseFloat(sqmMatch[1].replace(",", ".")) : null;

  return {
    id: immobiliareListingCacheId(numericId),
    title: title.slice(0, 200),
    price,
    operation: operationFromText(url, title, html),
    url,
    lat: latMatch ? parseFloat(latMatch[1]) : 0,
    lng: lngMatch ? parseFloat(lngMatch[1]) : 0,
    sqm: sqm != null ? Math.round(sqm) : null,
    rooms: roomsMatch ? parseInt(roomsMatch[1], 10) : null,
    address: title.slice(0, 200),
    property_type: null,
    property_type_label: null,
    condition_status: conditionInfo.condition_status,
    condition: conditionInfo.condition,
    needs_renovation: conditionInfo.needs_renovation,
    bathrooms: null,
    floor: null,
    energy_class: null,
    energy_kwh_sqm: null,
    zone: null,
    city_label: null,
    price_per_sqm: sqm ? Math.round(price / sqm) : null,
    condominio_monthly: null,
    lift: null,
    garden: null,
    terrace: null,
    garage: null,
    furnished: null,
    built_year: null,
    description: null,
    images: [],
    fetched_at: new Date().toISOString(),
  };
}
