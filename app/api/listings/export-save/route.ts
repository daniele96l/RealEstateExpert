import { NextResponse } from "next/server";
import type { ListingsExportBundle } from "@/lib/listings-export";
import {
  listingsExportFileLabel,
  saveListingsExportCache,
} from "@/lib/server/listings-export-cache";
import { isServerCacheReadOnly } from "@/lib/server/fs-cache-io";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const bundle = (await request.json()) as ListingsExportBundle;
    if (!bundle?.city || !Array.isArray(bundle.listings)) {
      return NextResponse.json({ detail: "Invalid export payload" }, { status: 400 });
    }

    const { path: savedPath } = await saveListingsExportCache(bundle);

    return NextResponse.json({
      ok: true,
      path: savedPath,
      count: bundle.count,
      read_only_host: isServerCacheReadOnly(),
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Export save failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    exports_dir: "data/listings/exports",
    read_only_host: isServerCacheReadOnly(),
  });
}
