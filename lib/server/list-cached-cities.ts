import fs from "fs/promises";
import path from "path";
import type { CachedCityOption } from "@/lib/cached-cities";
import {
  cityLabelFromSlug,
  isDuplicateCacheSlug,
  labelFromDisplayName,
  queryFromSlug,
} from "@/lib/cached-cities";
import { MARKETS, type MarketId } from "@/lib/markets";
import type { CityListingsCache } from "@/lib/types";
import { readJsonFile } from "./fs-cache-io";

const DATA_DIR = path.join(process.cwd(), "data", "listings");

function parseCacheSlug(filename: string, market: MarketId): string | null {
  const prefix = MARKETS[market].cachePrefix;
  const match = filename.match(new RegExp(`^(${prefix}_[a-z0-9_]+)_(sale|rent)\\.json$`));
  return match?.[1] ?? null;
}

async function labelForSlug(slug: string, market: MarketId): Promise<{ label: string; query: string }> {
  const query = queryFromSlug(slug, market);
  for (const operation of ["sale", "rent"] as const) {
    const cache = await readJsonFile<CityListingsCache>(path.join(DATA_DIR, `${slug}_${operation}.json`));
    if (!cache) continue;
    const fromCenter = labelFromDisplayName(cache.center.display_name);
    return { label: fromCenter ?? cityLabelFromSlug(slug, market), query };
  }
  const label = cityLabelFromSlug(slug, market);
  return { label, query };
}

export async function listCachedListingCities(market: MarketId): Promise<CachedCityOption[]> {
  let files: string[];
  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }

  const slugs = new Set<string>();
  for (const file of files) {
    const slug = parseCacheSlug(file, market);
    if (slug && !isDuplicateCacheSlug(slug, market)) slugs.add(slug);
  }

  const options = await Promise.all(
    [...slugs].map(async (slug) => {
      const { label, query } = await labelForSlug(slug, market);
      return { slug, label, query };
    }),
  );

  return options.sort((a, b) => a.label.localeCompare(b.label, "cs"));
}
