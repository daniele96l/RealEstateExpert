import { loadEnvLocal } from "../lib/server/load-env";
import { fetchBrnoRentalsListings } from "../lib/server/brno-rentals-fetch";
import { saveCache } from "../lib/server/listings-cache";
import { runOccupancySnapshot } from "../lib/occupancy/snapshot";

async function main() {
  loadEnvLocal();
  console.log("Fetching Sreality rentals (Brno)…");

  const cache = await fetchBrnoRentalsListings(10, (progress) => {
    console.log(
      `  page ${progress.page}/${progress.maxPages} · ${progress.listingsTotal} listings`,
    );
  });

  await saveCache(cache, "cz");
  console.log(`Saved listings cache: ${cache.listings.length} rentals`);

  const result = await runOccupancySnapshot("sreality", undefined, {
    citySlug: "brno",
    prefetched: cache,
    provider: "sreality",
  });

  console.log(`Occupancy snapshot #${result.registry.snapshot_count}`);
  console.log(
    `Fetched: ${result.fetched_count} · Active: ${result.metrics.active_count} · Occupancy: ${result.metrics.estimated_occupancy_pct ?? "—"}%`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
