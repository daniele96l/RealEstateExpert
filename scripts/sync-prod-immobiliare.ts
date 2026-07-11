import { loadEnvLocal } from "../lib/server/load-env";
import { fetchReggioRentalsListings, type ReggioRentalsFetchProgress } from "../lib/server/reggio-rentals-fetch";
import { saveCache } from "../lib/server/listings-cache";
import { runOccupancySnapshot } from "../lib/occupancy/snapshot";
import { OCCUPANCY_MARKET } from "../lib/occupancy/constants";

function logScraperProgress(progress: ReggioRentalsFetchProgress): void {
  if (progress.phase === "fetch") {
    console.log(`  loading page ${progress.page}/${progress.maxPages}…`);
    return;
  }
  if (progress.phase === "enrich" && progress.enrichTotal) {
    console.log(`  enriching dates ${progress.enrichDone ?? 0}/${progress.enrichTotal}`);
    return;
  }
  console.log(`  page ${progress.page}/${progress.maxPages} · ${progress.listingsTotal} listings`);
}

async function main() {
  loadEnvLocal();
  console.log("Scraping Immobiliare.it rentals (Reggio Calabria)…");

  const cache = await fetchReggioRentalsListings(10, logScraperProgress);

  await saveCache(cache, OCCUPANCY_MARKET);
  console.log(`Saved listings cache: ${cache.listings.length} rentals`);

  const result = await runOccupancySnapshot("immobiliare_scraper", undefined, {
    citySlug: "reggio_calabria",
    prefetched: cache,
    provider: "reggio_rentals",
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
