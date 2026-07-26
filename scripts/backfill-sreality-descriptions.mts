import { backfillSrealityDescriptions } from "../lib/occupancy/backfill-sreality-descriptions";

const result = await backfillSrealityDescriptions("brno", "sreality", (progress) => {
  console.log(
    `[${progress.phase}] ${progress.done}/${progress.total} · updated ${progress.updated} · failed ${progress.failed}`,
  );
});

console.log(JSON.stringify(result, null, 2));
