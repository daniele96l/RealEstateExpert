import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { ListingDetail } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data", "listings", "details");

function cacheFilePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function getPropertyDetailCache(id: string): Promise<ListingDetail | null> {
  try {
    const raw = await readFile(cacheFilePath(id), "utf-8");
    return JSON.parse(raw) as ListingDetail;
  } catch {
    return null;
  }
}

export async function savePropertyDetailCache(detail: ListingDetail): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(cacheFilePath(detail.id), JSON.stringify(detail, null, 2), "utf-8");
}
