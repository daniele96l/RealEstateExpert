import type { MarketPriceHistory, PriceHistoryPoint } from "@/lib/types";
import { getMarket, listingsCacheSlug, type MarketId } from "@/lib/markets";
import { getCache } from "./listings-cache";
import { getMarketCache } from "./market-cache";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class SrealityMarketError extends Error {}

interface GraphPoint {
  avg_price_per_sqm: number;
  month: number;
  year: number;
}

function monthRange(monthsBack: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - monthsBack);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}

function toHistoryPoint(p: GraphPoint): PriceHistoryPoint {
  const month = Number(p.month);
  return {
    year: p.year,
    month,
    label: `${String(month).padStart(2, "0")}/${p.year}`,
    price_sqm_avg: Math.round(p.avg_price_per_sqm),
  };
}

async function fetchPriceMapGraph(
  regionId: number,
  dateFrom: string,
  dateTo: string,
): Promise<PriceHistoryPoint[]> {
  const params = new URLSearchParams({
    category_main_cb: "1",
    category_type_cb: "1",
    date_from: dateFrom,
    date_to: dateTo,
    locality: `region,${regionId}`,
  });

  const res = await fetch(`https://www.sreality.cz/api/v1/price_map/graph?${params}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new SrealityMarketError(`Sreality price map error ${res.status}`);
  }

  const data = (await res.json()) as { result?: { graph_main?: GraphPoint[] } };
  const graph = data.result?.graph_main ?? [];
  if (!graph.length) {
    throw new SrealityMarketError("Sreality price map returned no history points");
  }

  return graph.map(toHistoryPoint);
}

function medianPricePerSqm(listings: { price: number; sqm: number | null }[]): number | null {
  const values = listings
    .filter((l) => l.sqm != null && l.sqm > 0)
    .map((l) => l.price / (l.sqm as number))
    .sort((a, b) => a - b);
  return values.length ? values[Math.floor(values.length / 2)] : null;
}

function mergeRentSnapshot(
  existing: PriceHistoryPoint[],
  median: number,
  at = new Date(),
): PriceHistoryPoint[] {
  const year = at.getFullYear();
  const month = at.getMonth() + 1;
  const key = `${year}-${month}`;
  const point: PriceHistoryPoint = {
    year,
    month,
    label: `${String(month).padStart(2, "0")}/${year}`,
    price_sqm_avg: Math.round(median),
  };
  const byKey = new Map(existing.map((p) => [`${p.year}-${p.month}`, p]));
  byKey.set(key, point);
  return [...byKey.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );
}

async function rentHistoryFromListings(
  city: string,
  market: MarketId,
  previous: PriceHistoryPoint[],
): Promise<PriceHistoryPoint[]> {
  const rentCache = await getCache(market, city, "rent");
  const median = rentCache ? medianPricePerSqm(rentCache.listings) : null;
  if (median == null) return previous;
  return mergeRentSnapshot(previous, median);
}

export async function fetchSrealityMarketHistory(
  city: string,
  market: MarketId = "cz",
): Promise<MarketPriceHistory> {
  const cfg = getMarket(market);
  const regionId = cfg.srealityRegionId;
  if (regionId == null) {
    throw new SrealityMarketError(`No Sreality region configured for ${city}`);
  }

  const { from, to } = monthRange(48);
  const sale = await fetchPriceMapGraph(regionId, from, to);

  const slug = listingsCacheSlug(market, city);
  const previous = await getMarketCache(city, market);
  const rent = await rentHistoryFromListings(city, market, previous?.rent ?? []);

  return {
    city,
    region: cfg.label,
    region_slug: slug,
    city_slug: slug,
    mercato_url: "https://www.sreality.cz/cenova-mapa",
    sale,
    rent,
    provider: "sreality",
    fetched_at: new Date().toISOString(),
  };
}
