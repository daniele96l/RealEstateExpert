#!/usr/bin/env npx tsx
import { loadEnvLocal } from "../lib/server/load-env";
import { fetchItalyListingsWithFallback } from "../lib/server/italy-listings-fetch";
import { fetchCityListings } from "../lib/server/idealista-search";
import { fetchImmobiliareCityListings } from "../lib/server/immobiliare-search";
import { fetchCityListingsViaRealtyApi } from "../lib/server/realtyapi-immobiliare";
import { fetchCityListingsViaRapidApi as fetchIdealistaRapid } from "../lib/server/rapidapi-idealista";
import { fetchCityListingsViaRapidApi as fetchImmobiliareRapid } from "../lib/server/rapidapi-immobiliare";
import type { ListingsProvider } from "../lib/types";

type TestCase = {
  label: string;
  provider: ListingsProvider;
  run: () => Promise<{ listings: { length: number } }>;
};

async function runCase(test: TestCase): Promise<void> {
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
    console.log(`  └─ ${msg.slice(0, 120)}`);
  }
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const city = args.find((a) => !a.startsWith("--")) ?? "Reggio Calabria";
  const operation = args.includes("--sale") ? "sale" : "rent";

  console.log(`Testing listing providers for ${city} (${operation}), maxPages=1\n`);
  console.log(`${"Provider".padEnd(28)} Status Count          Latency`);
  console.log("-".repeat(72));

  const tests: TestCase[] = [
    {
      label: "unified fallback",
      provider: "realtyapi",
      run: () => fetchItalyListingsWithFallback(city, operation, "realtyapi", 1).then((r) => r.data),
    },
    {
      label: "realtyapi (Immobiliare)",
      provider: "realtyapi",
      run: () => fetchCityListingsViaRealtyApi(city, operation, 1),
    },
    {
      label: "direct (Immobiliare)",
      provider: "direct",
      run: () => fetchImmobiliareCityListings(city, operation, { maxPages: 1 }),
    },
    {
      label: "rapidapi (Immobiliare)",
      provider: "rapidapi",
      run: () => fetchImmobiliareRapid(city, operation, 1),
    },
    {
      label: "scrapingbee (Idealista)",
      provider: "scrapingbee",
      run: () => fetchCityListings(city, operation, "scrapingbee", 1),
    },
    {
      label: "direct (Idealista)",
      provider: "direct",
      run: () => fetchCityListings(city, operation, "direct", 1),
    },
    {
      label: "rapidapi (Idealista)",
      provider: "rapidapi",
      run: () => fetchIdealistaRapid(city, operation, 1),
    },
  ];

  for (const test of tests) {
    await runCase(test);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
