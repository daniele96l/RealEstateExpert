import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { CityListingsCache } from "@/lib/types";
import { normalizeCitySlug } from "./geocode";

const DATA_DIR = path.join(process.cwd(), "data", "listings");

function cacheFilePath(city: string, operation: string): string {
  return path.join(DATA_DIR, `${normalizeCitySlug(city)}_${operation}.json`);
}

export async function getCache(city: string, operation: string): Promise<CityListingsCache | null> {
  try {
    const raw = await readFile(cacheFilePath(city, operation), "utf-8");
    return JSON.parse(raw) as CityListingsCache;
  } catch {
    return null;
  }
}

export async function saveCache(data: CityListingsCache): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(cacheFilePath(data.city, data.operation), JSON.stringify(data, null, 2), "utf-8");
}
