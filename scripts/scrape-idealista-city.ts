#!/usr/bin/env npx tsx
import { BATCH_FETCH_ALL_PAGES, resolveItalyListingMaxPages } from "../lib/batch-fetch-pages";
import { fetchItalyListingsScraped } from "../lib/server/italy-listings-scrape";
import { loadEnvLocal } from "../lib/server/load-env";
import { getCache, mergeListingCache, saveCache } from "../lib/server/listings-cache";

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const city = args.find((a) => !a.startsWith("--")) ?? "Reggio Calabria";
  const sale = !args.includes("--rent-only");
  const rent = !args.includes("--sale-only");
  const maxPagesArg = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesArg != null ? Number(maxPagesArg) : BATCH_FETCH_ALL_PAGES;
  const pageLimit = resolveItalyListingMaxPages(maxPages);

  console.error(`Scraping: ${city} (maxPages=${maxPages === BATCH_FETCH_ALL_PAGES ? "all" : pageLimit})`);

  const results: Array<{ operation: string; count: number; newCount: number }> = [];

  for (const op of (sale && rent ? ["sale", "rent"] : sale ? ["sale"] : ["rent"]) as Array<
    "sale" | "rent"
  >) {
    console.error(`→ ${op === "sale" ? "vendita" : "affitto"}...`);
    const data = await fetchItalyListingsScraped(city, op, "idealista", maxPages);
    const existing = await getCache("it", data.city, op);
    const merged = mergeListingCache(existing, { ...data, provider: "direct" });
    await saveCache(merged);
    results.push({
      operation: op,
      count: merged.listings.length,
      newCount: data.listings.length,
    });
    console.error(`  ${merged.listings.length} annunci in cache (${data.listings.length} recuperati)`);
  }

  console.log(JSON.stringify({ city, results }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
