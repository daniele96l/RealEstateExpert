#!/usr/bin/env npx tsx
import { fetchWithFallback } from "../lib/server/listings-fetch";
import { getCache, mergeListingCache, saveCache } from "../lib/server/listings-cache";

async function main() {
  const args = process.argv.slice(2);
  const city = args.find((a) => !a.startsWith("--")) ?? "Reggio Calabria";
  const sale = !args.includes("--rent-only");
  const rent = !args.includes("--sale-only");
  const maxPages = Number(args.find((a) => a.startsWith("--max-pages="))?.split("=")[1] ?? "10");

  console.error(`Scraping Idealista: ${city} (maxPages=${maxPages})`);

  const results: Array<{ operation: string; count: number; newCount: number }> = [];

  for (const op of (sale && rent ? ["sale", "rent"] : sale ? ["sale"] : ["rent"]) as Array<
    "sale" | "rent"
  >) {
    console.error(`→ ${op === "sale" ? "vendita" : "affitto"}...`);
    const { data, provider } = await fetchWithFallback(city, op, "rapidapi", maxPages);
    const existing = await getCache(data.city, op);
    const merged = mergeListingCache(existing, { ...data, provider });
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
