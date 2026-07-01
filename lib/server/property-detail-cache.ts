import path from "path";
import type { ListingDetail } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "./fs-cache-io";

const DATA_DIR = path.join(process.cwd(), "data", "listings", "details");

function cacheFilePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function getPropertyDetailCache(id: string): Promise<ListingDetail | null> {
  return readJsonFile<ListingDetail>(cacheFilePath(id));
}

export async function savePropertyDetailCache(detail: ListingDetail): Promise<void> {
  await writeJsonFile(cacheFilePath(detail.id), detail);
}
