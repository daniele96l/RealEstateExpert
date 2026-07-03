import {
  extractImmobiliareListingId,
  normalizeImmobiliareListingUrl,
} from "@/lib/listing-url";
import { getRapidApiKey, hasRapidApiKey } from "./config";

const RAPIDAPI_HOST = "immobiliare-it-scraper.p.rapidapi.com";

export class RapidApiImmobiliareError extends Error {}

async function rapidApiGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`https://${RAPIDAPI_HOST}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": getRapidApiKey(),
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(60_000),
  });

  const text = await response.text();
  if (response.status === 403 && text.includes("not subscribed")) {
    throw new RapidApiImmobiliareError(
      'Abbonati a "Immobiliare.it Scraper" su RapidAPI (immobiliare-it-scraper) per importare link Immobiliare.',
    );
  }
  if (!response.ok) {
    throw new RapidApiImmobiliareError(
      `RapidAPI Immobiliare (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RapidApiImmobiliareError("Risposta RapidAPI Immobiliare non valida");
  }
}

function unwrapPayload(data: unknown): Record<string, unknown> {
  const obj = data != null && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
  if (!obj) return {};

  for (const key of ["data", "result", "listing", "realEstate", "property", "item"]) {
    const nested = obj[key];
    if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return obj;
}

export async function fetchImmobiliareListingPayload(url: string): Promise<Record<string, unknown>> {
  if (!hasRapidApiKey()) {
    throw new RapidApiImmobiliareError("RAPIDAPI_KEY non configurata in .env.local");
  }

  const normalized = normalizeImmobiliareListingUrl(url);
  const numericId = extractImmobiliareListingId(normalized);
  if (!numericId) throw new RapidApiImmobiliareError("ID annuncio non trovato nell'URL");

  try {
    return unwrapPayload(await rapidApiGet("/details/byurl", { url: normalized }));
  } catch (byUrlError) {
    try {
      return unwrapPayload(await rapidApiGet("/details/byid", { id: numericId }));
    } catch {
      throw byUrlError;
    }
  }
}
