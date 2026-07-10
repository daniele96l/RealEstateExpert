#!/usr/bin/env npx tsx
import { loadEnvLocal } from "../lib/server/load-env";
import { fetchReggioRentalsListings } from "../lib/server/reggio-rentals-fetch";
import { fetchIdealistaScraperListings } from "../lib/server/idealista-rentals-fetch";
import { fetchCasaScraperListings } from "../lib/server/casa-rentals-fetch";
import { fetchSubitoScraperListings } from "../lib/server/subito-rentals-fetch";
import { fetchItalyListingsScraped } from "../lib/server/italy-listings-scrape";
import { fetchMarketHistoryViaScrape } from "../lib/server/immobiliare-market-scrape";

type ScraperTest = {
  label: string;
  run: () => Promise<{ listings?: { length: number }; history?: unknown[] }>;
};

async function runCase(test: ScraperTest): Promise<boolean> {
  const start = Date.now();
  try {
    const data = await test.run();
    const count = data.listings?.length ?? data.history?.length ?? 0;
    const ms = Date.now() - start;
    if (count <= 0) {
      console.log(`${test.label.padEnd(32)} FAIL  ${String(count).padStart(5)}           ${ms}ms`);
      console.log("  └─ returned 0 results");
      return false;
    }
    console.log(
      `${test.label.padEnd(32)} OK    ${String(count).padStart(5)} results   ${ms}ms`,
    );
    return true;
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`${test.label.padEnd(32)} FAIL  ${"—".padStart(5)}           ${ms}ms`);
    console.log(`  └─ ${msg.slice(0, 200)}`);
    return false;
  }
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith("--"));
  const maxPages = Number(args.find((a) => a.startsWith("--max-pages="))?.split("=")[1] ?? "1");

  console.log(`Live scraper verification (headless), maxPages=${maxPages}\n`);
  console.log(`${"Test".padEnd(32)} Status Count          Latency`);
  console.log("-".repeat(76));

  const tests: ScraperTest[] = [
    {
      label: "immobiliare_batch",
      run: () => fetchItalyListingsScraped("Reggio Calabria", "rent", "immobiliare", maxPages),
    },
    {
      label: "immobiliare_market",
      run: async () => {
        const result = await fetchMarketHistoryViaScrape("Reggio Calabria");
        const count = result.sale.length + result.rent.length;
        return { listings: { length: count } };
      },
    },
    {
      label: "immobiliare_scraper",
      run: () => fetchReggioRentalsListings(maxPages),
    },
    {
      label: "idealista_scraper",
      run: () => fetchIdealistaScraperListings(maxPages),
    },
    {
      label: "idealista_batch",
      run: () => fetchItalyListingsScraped("Reggio Calabria", "rent", "idealista", maxPages),
    },
    {
      label: "casa_scraper",
      run: () => fetchCasaScraperListings(maxPages),
    },
    {
      label: "subito_scraper",
      run: () => fetchSubitoScraperListings(maxPages),
    },
  ];

  const selected = only ? tests.filter((test) => test.label.includes(only)) : tests;
  if (!selected.length) {
    console.error(`No test matched "${only}"`);
    process.exit(1);
  }

  const results: boolean[] = [];
  for (const test of selected) {
    const ok = await runCase(test);
    results.push(ok);
  }
  const failed = results.filter((ok) => !ok).length;

  console.log("-".repeat(76));
  if (failed) {
    console.error(`\n${failed}/${selected.length} scraper(s) failed.`);
    if (!process.env.SCRAPER_PROXY_SERVER?.trim()) {
      console.error(
        "Idealista may require SCRAPER_PROXY_SERVER if DataDome blocks your IP.",
      );
    }
    process.exit(1);
  }
  console.log(`\nAll ${selected.length} scraper(s) passed.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
