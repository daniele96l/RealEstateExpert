import { loadEnvLocal } from "../lib/server/load-env";
import { BATCH_FETCH_ALL_PAGES } from "../lib/batch-fetch-pages";
import { getOccupancyCityConfig, type OccupancyCitySlug } from "../lib/occupancy/cities";
import { fetchSrealityRentalsListings } from "../lib/server/brno-rentals-fetch";
import { saveCache } from "../lib/server/listings-cache";
import { runOccupancySnapshot } from "../lib/occupancy/snapshot";

const CZ_CITIES: OccupancyCitySlug[] = ["brno", "tabor", "rosice", "prague", "ostrava"];

async function syncCity(citySlug: OccupancyCitySlug) {
  const { city, market } = getOccupancyCityConfig(citySlug);
  console.log(`\n=== ${city} ===`);

  const cache = await fetchSrealityRentalsListings(
    citySlug,
    BATCH_FETCH_ALL_PAGES,
    (progress) => {
      console.log(`  page ${progress.page}/${progress.maxPages} · ${progress.listingsTotal} listings`);
    },
  );

  const rooms = cache.listings.filter((l) => l.property_type === "room").length;
  const flats = cache.listings.filter((l) => l.property_type === "flat").length;
  await saveCache(cache, market);
  console.log(
    `Saved listings cache: ${cache.listings.length} rentals (${flats} byt, ${rooms} pokoj)`,
  );

  const result = await runOccupancySnapshot("sreality", undefined, {
    citySlug,
    prefetched: cache,
    provider: "sreality",
  });

  const typeSeg = result.metrics.segments?.type ?? [];
  console.log(`Occupancy snapshot #${result.registry.snapshot_count}`);
  console.log(
    `Fetched: ${result.fetched_count} · Active: ${result.metrics.active_count} · Occupancy: ${result.metrics.estimated_occupancy_pct ?? "—"}%`,
  );
  console.log(
    `Type segments: ${typeSeg.map((s) => `${s.segment_id}=${s.active_count}`).join(", ") || "—"}`,
  );
}

async function main() {
  loadEnvLocal();
  for (const citySlug of CZ_CITIES) {
    await syncCity(citySlug);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
