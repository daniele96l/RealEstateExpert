import path from "path";
import type { MarketPriceHistory } from "@/lib/types";
import { listingsCacheSlug, type MarketId } from "@/lib/markets";
import { normalizeCitySlug } from "./geocode";
import { readJsonFile, writeJsonFile } from "./fs-cache-io";

const DATA_DIR = path.join(process.cwd(), "data", "market");

function cacheFilePath(city: string, market: MarketId = "it"): string {
  const slug = market === "cz" ? listingsCacheSlug(market, city) : normalizeCitySlug(city);
  return path.join(DATA_DIR, `${slug}.json`);
}

export async function getMarketCache(
  city: string,
  market: MarketId = "it",
): Promise<MarketPriceHistory | null> {
  return readJsonFile<MarketPriceHistory>(cacheFilePath(city, market));
}

export async function saveMarketCache(
  data: MarketPriceHistory,
  market: MarketId = "it",
): Promise<void> {
  const slug = data.city_slug || (market === "cz" ? listingsCacheSlug(market, data.city) : normalizeCitySlug(data.city));
  await writeJsonFile(path.join(DATA_DIR, `${slug}.json`), data);
}
