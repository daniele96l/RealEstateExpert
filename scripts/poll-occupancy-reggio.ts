import { loadEnvLocal } from "../lib/server/load-env";
import { runOccupancySnapshot } from "../lib/occupancy/snapshot";

async function main() {
  loadEnvLocal();
  console.log("Running occupancy snapshot for Reggio Calabria…");
  const result = await runOccupancySnapshot();
  console.log(`Snapshot #${result.registry.snapshot_count}`);
  console.log(`Fetched: ${result.fetched_count} · New: ${result.new_count} · Rented: ${result.rented_count}`);
  console.log(`Active: ${result.metrics.active_count}`);
  console.log(`Avg DOM: ${result.metrics.avg_days_on_market ?? "—"} days`);
  console.log(`Estimated occupancy (${result.metrics.occupancy_window_days}d): ${result.metrics.estimated_occupancy_pct ?? "—"}%`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
