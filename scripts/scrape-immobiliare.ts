#!/usr/bin/env npx tsx
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fetchImmobiliareListingDetail } from "../lib/server/immobiliare-import";

async function main() {
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const url = args.find((a) => !a.startsWith("--"));

  if (!url) {
    console.error("Usage: npx tsx scripts/scrape-immobiliare.ts <url> [--save]");
    process.exit(1);
  }

  const detail = await fetchImmobiliareListingDetail(url);
  console.log(JSON.stringify(detail, null, 2));

  if (save) {
    const outPath = join(process.cwd(), "data", "listings", "details", `${detail.id}.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(detail, null, 2), "utf-8");
    console.error(`Saved to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
