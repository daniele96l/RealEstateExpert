import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { MarketPriceHistory } from "@/lib/types";
import { normalizeCitySlug } from "./geocode";

const DATA_DIR = path.join(process.cwd(), "data", "market");

function cacheFilePath(city: string): string {
  return path.join(DATA_DIR, `${normalizeCitySlug(city)}.json`);
}

export async function getMarketCache(city: string): Promise<MarketPriceHistory | null> {
  try {
    const raw = await readFile(cacheFilePath(city), "utf-8");
    return JSON.parse(raw) as MarketPriceHistory;
  } catch {
    return null;
  }
}

export async function saveMarketCache(data: MarketPriceHistory): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const slug = normalizeCitySlug(data.city_slug || data.city);
  await writeFile(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(data, null, 2), "utf-8");
}
