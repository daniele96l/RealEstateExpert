#!/usr/bin/env npx tsx
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BATCH_FETCH_ALL_PAGES, resolveItalyListingMaxPages } from "../lib/batch-fetch-pages";
import { fetchImmobiliareListingDetail } from "../lib/server/immobiliare-import";
import { fetchImmobiliareCityListings } from "../lib/server/immobiliare-search";
import { getCache, mergeListingCache, saveCache } from "../lib/server/listings-cache";
import { savePropertyDetailCache } from "../lib/server/property-detail-cache";

async function main() {
  const args = process.argv.slice(2);
  const city = args.find((a) => !a.startsWith("--")) ?? "reggio calabria";
  const sale = !args.includes("--rent-only");
  const rent = !args.includes("--sale-only");
  const withDetails = args.includes("--details");
  const maxPagesArg = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesArg != null ? Number(maxPagesArg) : BATCH_FETCH_ALL_PAGES;
  const pageLimit = resolveItalyListingMaxPages(maxPages);
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");

  console.error(
    `Scraping Immobiliare: ${city} (maxPages=${maxPages === BATCH_FETCH_ALL_PAGES ? "all" : pageLimit}, details=${withDetails})`,
  );

  const caches = [];
  if (sale) {
    console.error("→ vendita...");
    const data = await fetchImmobiliareCityListings(city, "sale", { maxPages });
    console.error(`  ${data.listings.length} annunci vendita`);
    const existing = await getCache("it", data.city, "sale");
    await saveCache(mergeListingCache(existing, data));
    caches.push(data);
  }
  if (rent) {
    console.error("→ affitto...");
    const data = await fetchImmobiliareCityListings(city, "rent", { maxPages });
    console.error(`  ${data.listings.length} annunci affitto`);
    const existing = await getCache("it", data.city, "rent");
    await saveCache(mergeListingCache(existing, data));
    caches.push(data);
  }

  if (withDetails) {
    const ids = [...new Set(caches.flatMap((c) => c.listings.map((l) => l.url)))];
    const targets = limit > 0 ? ids.slice(0, limit) : ids;
    console.error(`→ dettagli per ${targets.length} annunci...`);
    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      try {
        const detail = await fetchImmobiliareListingDetail(url);
        await savePropertyDetailCache(detail);
        console.error(`  [${i + 1}/${targets.length}] ${detail.id} €${detail.price} ${detail.images.length} foto`);
        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        console.error(`  [${i + 1}/${targets.length}] FAIL ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const outDir = path.join(process.cwd(), "data", "listings");
  await mkdir(outDir, { recursive: true });
  const summary = {
    city,
    fetched_at: new Date().toISOString(),
    sale: caches.find((c) => c.operation === "sale")?.listings.length ?? 0,
    rent: caches.find((c) => c.operation === "rent")?.listings.length ?? 0,
    caches,
  };
  const summaryPath = path.join(outDir, `${summary.caches[0]?.city ?? "import"}_immobiliare_summary.json`);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(JSON.stringify({ summaryPath, sale: summary.sale, rent: summary.rent }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
