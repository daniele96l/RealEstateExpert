import path from "path";
import { listingsCacheSlug, type MarketId } from "@/lib/markets";
import type { ListingsExportBundle } from "@/lib/listings-export";
import { writeJsonFile } from "./fs-cache-io";

const EXPORTS_DIR = path.join(process.cwd(), "data", "listings", "exports");

export function listingsExportFileName(bundle: ListingsExportBundle): string {
  const slug = listingsCacheSlug(bundle.market, bundle.city);
  const date = bundle.exported_at.slice(0, 10);
  const time = bundle.exported_at.slice(11, 19).replace(/:/g, "");
  return `listings_${bundle.market}_${slug}_sale_${date}_${time}.json`;
}

export function listingsExportFilePath(bundle: ListingsExportBundle): string {
  return path.join(EXPORTS_DIR, listingsExportFileName(bundle));
}

export function listingsExportFileLabel(bundle: ListingsExportBundle): string {
  return `data/listings/exports/${listingsExportFileName(bundle)}`;
}

export async function saveListingsExportCache(
  bundle: ListingsExportBundle,
): Promise<{ saved: boolean; path: string }> {
  const filePath = listingsExportFilePath(bundle);
  await writeJsonFile(filePath, bundle);
  return { saved: true, path: listingsExportFileLabel(bundle) };
}
