import path from "path";
import type { MarketPriceHistory } from "@/lib/types";
import { normalizeCitySlug } from "./geocode";
import { readJsonFile, writeJsonFile } from "./fs-cache-io";

const DATA_DIR = path.join(process.cwd(), "data", "market");

function cacheFilePath(city: string): string {
  return path.join(DATA_DIR, `${normalizeCitySlug(city)}.json`);
}

export async function getMarketCache(city: string): Promise<MarketPriceHistory | null> {
  return readJsonFile<MarketPriceHistory>(cacheFilePath(city));
}

export async function saveMarketCache(data: MarketPriceHistory): Promise<void> {
  const slug = normalizeCitySlug(data.city_slug || data.city);
  await writeJsonFile(path.join(DATA_DIR, `${slug}.json`), data);
}
