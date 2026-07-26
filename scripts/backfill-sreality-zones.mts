import { backfillSrealityZones } from "../lib/occupancy/backfill-sreality-zones";
import { resolveOccupancyOperation } from "../lib/occupancy/operation";

const operation = resolveOccupancyOperation(
  process.argv.find((arg) => arg.startsWith("--operation="))?.slice("--operation=".length) ??
    "sale",
);

const result = await backfillSrealityZones("brno", "sreality", operation, (progress) => {
  console.log(
    `[zones] ${progress.done}/${progress.total} · updated ${progress.updated} · failed ${progress.failed}`,
  );
});

console.log(JSON.stringify(result, null, 2));
