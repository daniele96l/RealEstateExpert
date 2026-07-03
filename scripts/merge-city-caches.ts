#!/usr/bin/env npx tsx
import { getCache, mergeListingCache, saveCache } from "../lib/server/listings-cache";
import { normalizeCitySlug } from "../lib/server/geocode";

async function main() {
  const args = process.argv.slice(2);
  const target = normalizeCitySlug(args.find((a) => !a.startsWith("--")) ?? "Reggio Calabria");
  const aliases = args
    .filter((a) => a.startsWith("--alias="))
    .map((a) => normalizeCitySlug(a.slice("--alias=".length)));

  if (!aliases.length) {
    console.error("Usage: merge-city-caches.ts <city> --alias=other_slug [--alias=...]");
    process.exit(1);
  }

  for (const operation of ["sale", "rent"] as const) {
    let merged = await getCache(target, operation);
    for (const alias of aliases) {
      const aliasCache = await getCache(alias, operation);
      if (!aliasCache) continue;
      merged = mergeListingCache(merged, { ...aliasCache, city: target });
    }
    if (!merged) {
      console.error(`Nessuna cache per ${target} ${operation}`);
      continue;
    }
    await saveCache(merged);
    console.error(`${operation}: ${merged.listings.length} annunci → ${target}_${operation}.json`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
