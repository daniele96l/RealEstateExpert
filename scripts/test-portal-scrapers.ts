#!/usr/bin/env npx tsx
import { loadEnvLocal } from "../lib/server/load-env";
import { fetchReggioRentalsListings } from "../lib/server/reggio-rentals-fetch";
import { fetchIdealistaScraperListings } from "../lib/server/idealista-rentals-fetch";
import { fetchCasaScraperListings } from "../lib/server/casa-rentals-fetch";
import { fetchSubitoScraperListings } from "../lib/server/subito-rentals-fetch";

type PortalTest = {
  label: string;
  run: () => Promise<{ listings: { length: number } }>;
};

async function runCase(test: PortalTest): Promise<void> {
  const start = Date.now();
  try {
    const data = await test.run();
    const ms = Date.now() - start;
    console.log(
      `${test.label.padEnd(28)} OK    ${String(data.listings.length).padStart(5)} listings  ${ms}ms`,
    );
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`${test.label.padEnd(28)} FAIL  ${"—".padStart(5)}           ${ms}ms`);
    console.log(`  └─ ${msg.slice(0, 160)}`);
  }
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith("--"));
  const maxPages = Number(args.find((a) => a.startsWith("--max-pages="))?.split("=")[1] ?? "1");

  console.log(`Testing occupancy portal scrapers (Reggio Calabria rent), maxPages=${maxPages}\n`);
  console.log(`${"Portal".padEnd(28)} Status Count          Latency`);
  console.log("-".repeat(72));

  const tests: PortalTest[] = [
    {
      label: "immobiliare_scraper",
      run: () => fetchReggioRentalsListings(maxPages),
    },
    {
      label: "idealista_scraper",
      run: () => fetchIdealistaScraperListings(maxPages),
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
    console.error(`No portal matched "${only}"`);
    process.exit(1);
  }

  for (const test of selected) {
    await runCase(test);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
