import { readFileSync } from "fs";
import path from "path";
import { loadEnvLocal } from "../lib/server/load-env";
import { runOccupancySnapshot } from "../lib/occupancy/snapshot";
import type { CityListingsCache } from "../lib/types";

async function main() {
  loadEnvLocal();
  const cachePath = path.join(process.cwd(), "data", "listings", "cz_brno_rent.json");
  const cache = JSON.parse(readFileSync(cachePath, "utf8")) as CityListingsCache;

  console.log(`Seeding Brno occupancy from ${cache.listings.length} cached rentals…`);
  const result = await runOccupancySnapshot("sreality", undefined, {
    citySlug: "brno",
    prefetched: cache,
    provider: "sreality",
  });

  console.log(`Snapshot #${result.registry.snapshot_count}`);
  console.log(`Active listings: ${result.metrics.active_count}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
