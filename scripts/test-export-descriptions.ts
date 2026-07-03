import fs from "node:fs";
import path from "node:path";
import { fetchPropertyDetailForListing } from "../lib/server/fetch-property-detail";
import { fetchSrealityPropertyDetail } from "../lib/server/sreality-detail";
import type { MapListing } from "../lib/types";

const DETAILS_DIR = path.join(process.cwd(), "data/listings/details");
const SAMPLE_SIZE = 3;

function loadSampleListings(): MapListing[] {
  const sale = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data/listings/cz_brno_sale.json"), "utf8"),
  ) as { listings: MapListing[] };

  return sale.listings.filter((l) => l.url?.includes("sreality.cz")).slice(0, SAMPLE_SIZE);
}

async function testDirectFetch(listings: MapListing[]) {
  console.log("\n=== 1. Direct Sreality fetch ===");
  for (const listing of listings) {
    const detail = await fetchSrealityPropertyDetail(listing.url, listing);
    const ok = Boolean(detail.description?.trim()) && detail.images.length > 0;
    console.log(
      ok ? "PASS" : "FAIL",
      listing.id,
      `desc=${detail.description?.length ?? 0}`,
      `images=${detail.images.length}`,
    );
    if (!ok) process.exitCode = 1;
  }
}

async function testPropertyApi(listings: MapListing[]) {
  console.log("\n=== 2. POST /api/listings/property ===");
  const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";

  for (const listing of listings) {
    const res = await fetch(`${base}/api/listings/property`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing, refresh: true }),
    });
    if (!res.ok) {
      console.log("FAIL", listing.id, res.status, await res.text());
      process.exitCode = 1;
      continue;
    }
    const detail = (await res.json()) as { description?: string | null; images?: string[] };
    const ok = Boolean(detail.description?.trim()) && (detail.images?.length ?? 0) > 0;
    console.log(
      ok ? "PASS" : "FAIL",
      listing.id,
      `desc=${detail.description?.length ?? 0}`,
      `images=${detail.images?.length ?? 0}`,
    );
    if (!ok) process.exitCode = 1;
  }
}

async function testExportFlow(listings: MapListing[]) {
  console.log("\n=== 3. Export flow (fetch + local JSON) ===");

  for (const listing of listings) {
    const cachePath = path.join(DETAILS_DIR, `${listing.id}.json`);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);

    const detail = await fetchPropertyDetailForListing(listing, "sreality");
    fs.mkdirSync(DETAILS_DIR, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(detail, null, 2));

    const saved = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
      description?: string | null;
      images?: string[];
    };
    const ok = Boolean(saved.description?.trim()) && (saved.images?.length ?? 0) > 0;
    console.log(
      ok ? "PASS" : "FAIL",
      listing.id,
      `saved desc=${saved.description?.length ?? 0}`,
      `images=${saved.images?.length ?? 0}`,
    );
    if (!ok) process.exitCode = 1;
  }
}

async function main() {
  const listings = loadSampleListings();
  if (!listings.length) {
    console.error("No sample listings found");
    process.exit(1);
  }

  console.log(`Testing ${listings.length} Brno sale listings:`);
  listings.forEach((l) => console.log(" -", l.id));

  await testDirectFetch(listings);
  await testPropertyApi(listings);
  await testExportFlow(listings);

  console.log(process.exitCode ? "\nSome tests FAILED" : "\nAll tests PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
