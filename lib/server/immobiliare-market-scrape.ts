import * as cheerio from "cheerio";
import type { PriceHistoryPoint } from "@/lib/types";
import { parseGeographyFromRsc, resolveMercatoLocation, type MercatoLocation } from "./immobiliare-zone";
import { withImmobiliareBrowser } from "./immobiliare-browser";

export class ImmobiliareMarketError extends Error {}

function parseEuroValue(text: string): number | null {
  const normalized = text.replace(/\s/g, "").replace("€", "").replace(",", ".");
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function monthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function parseLastValidDate(html: string, contract: "sale" | "rent"): string | null {
  const type = contract === "sale" ? "sale" : "rent";
  const re = new RegExp(`"type":"${type}"[\\s\\S]*?"lastValidDate":"(\\d{4}-\\d{2}-\\d{2})"`);
  return html.match(re)?.[1] ?? null;
}

function pathToSeries(
  pathD: string,
  minPrice: number,
  maxPrice: number,
  endDate: string,
): PriceHistoryPoint[] {
  const coords = [...pathD.matchAll(/L?([\d.]+) ([\d.]+)/g)].map((m) => ({
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
  }));
  if (!coords.length) return [];

  const [endYear, endMonth] = endDate.split("-").map(Number);
  const start = addMonths(endYear, endMonth, -(coords.length - 1));

  return coords.map((coord, index) => {
    const { year, month } = addMonths(start.year, start.month, index);
    const price = maxPrice - (coord.y / 100) * (maxPrice - minPrice);
    return {
      year,
      month,
      label: monthLabel(year, month),
      price_sqm_avg: Math.round(price * 100) / 100,
    };
  });
}

function parseChartCards(html: string): { sale: PriceHistoryPoint[]; rent: PriceHistoryPoint[] } {
  const $ = cheerio.load(html);
  const saleEnd = parseLastValidDate(html, "sale") ?? new Date().toISOString().slice(0, 10);
  const rentEnd = parseLastValidDate(html, "rent") ?? saleEnd;

  const sale: PriceHistoryPoint[] = [];
  const rent: PriceHistoryPoint[] = [];

  $('[class*="ChartCard_card"], [class*="ChartCard"]').each((_, el) => {
    const card = $(el);
    const eyebrow = card.find('[class*="Header_eyebrow"], [class*="eyebrow"]').first().text().trim().toLowerCase();
    const title = card.find('[class*="Header_title"], h2, h3').first().text().trim();
    if (!title.includes("Prezzo medio")) return;

    const gridPrices = card
      .find('[class*="LineChart_gridItem"], [class*="gridItem__horizontal"]')
      .map((__, node) => parseEuroValue($(node).text()))
      .get()
      .filter((v): v is number => v != null);

    if (gridPrices.length < 2) return;

    const minPrice = Math.min(...gridPrices);
    const maxPrice = Math.max(...gridPrices);
    const pathD =
      card.find('[class*="LineChart_svgLine"], [class*="svgLine"] path').attr("d") ??
      card.find('path[class*="svgLine"]').attr("d");
    if (!pathD) return;

    const contract = eyebrow.includes("affitto") ? "rent" : "sale";
    const endDate = contract === "rent" ? rentEnd : saleEnd;
    const series = pathToSeries(pathD, minPrice, maxPrice, endDate);

    if (contract === "rent") rent.push(...series);
    else sale.push(...series);
  });

  if (!sale.length && !rent.length) {
    return parseChartCardsFromPayload(html);
  }

  return { sale, rent };
}

function parseChartCardsFromPayload(html: string): { sale: PriceHistoryPoint[]; rent: PriceHistoryPoint[] } {
  const sale: PriceHistoryPoint[] = [];
  const rent: PriceHistoryPoint[] = [];

  for (const contract of ["sale", "rent"] as const) {
    const endDate = parseLastValidDate(html, contract) ?? new Date().toISOString().slice(0, 10);
    const blockRe = new RegExp(
      `"type":"${contract}"[\\s\\S]{0,4000}?"minPrice":(\\d+(?:\\.\\d+)?)[\\s\\S]{0,2000}?"maxPrice":(\\d+(?:\\.\\d+)?)[\\s\\S]{0,4000}?"path":"([^"]+)"`,
    );
    const match = html.match(blockRe);
    if (!match) continue;
    const minPrice = parseFloat(match[1]);
    const maxPrice = parseFloat(match[2]);
    const pathD = match[3].replace(/\\u002F/g, "/");
    const series = pathToSeries(pathD, minPrice, maxPrice, endDate);
    if (contract === "rent") rent.push(...series);
    else sale.push(...series);
  }

  if (!sale.length && !rent.length) {
    throw new ImmobiliareMarketError("Grafici prezzo non trovati nella pagina immobiliare.it");
  }

  return { sale, rent };
}

export async function fetchMarketHistoryViaScrape(city: string): Promise<{
  location: MercatoLocation;
  sale: PriceHistoryPoint[];
  rent: PriceHistoryPoint[];
}> {
  const baseLocation = await resolveMercatoLocation(city);
  const slugVariants = [baseLocation.city_slug, baseLocation.city_slug.replace(/-/g, "_")];
  const urls = [...new Set(slugVariants.map((s) => `https://www.immobiliare.it/mercato-immobiliare/${baseLocation.region_slug}/${s}/`))];

  let html: string | null = null;
  let lastError: unknown;

  for (const url of urls) {
    try {
      html = await withImmobiliareBrowser((session) =>
        session.fetchHtml(url),
      );
      if (html.includes("Prezzo medio")) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!html || !html.includes("Prezzo medio")) {
    throw lastError instanceof Error
      ? lastError
      : new ImmobiliareMarketError(`Pagina mercato non trovata per ${city}`);
  }

  const parsedGeo = parseGeographyFromRsc(html);
  const location: MercatoLocation = {
    ...baseLocation,
    ...parsedGeo,
    lat: baseLocation.lat,
    lng: baseLocation.lng,
    mercato_url: parsedGeo?.mercato_url ?? baseLocation.mercato_url,
  };

  const { sale, rent } = parseChartCards(html);
  return { location, sale, rent };
}
