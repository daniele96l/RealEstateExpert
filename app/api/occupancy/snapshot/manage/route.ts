import { NextResponse } from "next/server";
import { resolveOccupancyCitySlug } from "@/lib/occupancy/constants";
import { loadOccupancyDashboard } from "@/lib/occupancy/dashboard";
import { resolveOccupancyPortal } from "@/lib/occupancy/portals";
import {
  loadSnapshotByFetchedAt,
  updateSnapshotListings,
} from "@/lib/occupancy/registry";
import { setSnapshotExcluded, snapshotMetaEntry, loadSnapshotMeta } from "@/lib/occupancy/snapshot-meta";
import { reconcileOccupancyAfterSnapshotChange } from "@/lib/occupancy/snapshot-reconcile";
import { isServerCacheReadOnly } from "@/lib/server/fs-cache-io";

function readOnlyResponse(): NextResponse {
  return NextResponse.json(
    { detail: "Snapshot edits are not available on read-only hosts (e.g. Vercel preview)." },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fetchedAt = searchParams.get("fetched_at")?.trim();
    if (!fetchedAt) {
      return NextResponse.json({ detail: "fetched_at is required" }, { status: 400 });
    }

    const citySlug = resolveOccupancyCitySlug(searchParams.get("city"));
    const portal = resolveOccupancyPortal(searchParams.get("portal"), citySlug);
    const [snapshot, metaFile] = await Promise.all([
      loadSnapshotByFetchedAt(fetchedAt, citySlug, portal),
      loadSnapshotMeta(citySlug, portal),
    ]);

    if (!snapshot) {
      return NextResponse.json({ detail: "Snapshot not found" }, { status: 404 });
    }

    return NextResponse.json({
      snapshot,
      meta: snapshotMetaEntry(metaFile, fetchedAt),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot read failed";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (isServerCacheReadOnly()) return readOnlyResponse();

  try {
    const body = (await request.json()) as {
      fetched_at?: string;
      city?: string;
      portal?: string;
      excluded?: boolean;
      exclude_reason?: string | null;
      remove_listing_ids?: string[];
      edit_note?: string | null;
      asOf?: string | null;
      period?: string | null;
      basis?: string | null;
    };

    const fetchedAt = body.fetched_at?.trim();
    if (!fetchedAt) {
      return NextResponse.json({ detail: "fetched_at is required" }, { status: 400 });
    }

    const citySlug = resolveOccupancyCitySlug(body.city);
    const portal = resolveOccupancyPortal(body.portal, citySlug);
    const snapshot = await loadSnapshotByFetchedAt(fetchedAt, citySlug, portal);
    if (!snapshot) {
      return NextResponse.json({ detail: "Snapshot not found" }, { status: 404 });
    }

    let changed = false;

    if (typeof body.excluded === "boolean") {
      await setSnapshotExcluded(fetchedAt, body.excluded, citySlug, portal, body.exclude_reason);
      changed = true;
    }

    const removeIds = new Set(body.remove_listing_ids ?? []);
    if (removeIds.size) {
      const listings = snapshot.listings.filter((listing) => !removeIds.has(listing.id));
      if (listings.length === snapshot.listings.length) {
        return NextResponse.json({ detail: "No matching listings to remove" }, { status: 400 });
      }
      await updateSnapshotListings(fetchedAt, listings, citySlug, portal, body.edit_note);
      changed = true;
    }

    if (!changed) {
      return NextResponse.json({ detail: "No changes requested" }, { status: 400 });
    }

    await reconcileOccupancyAfterSnapshotChange(citySlug, portal);
    const dashboard = await loadOccupancyDashboard(
      body.asOf ?? null,
      portal,
      citySlug,
      body.period ?? null,
      body.basis ?? null,
    );

    return NextResponse.json(dashboard);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot update failed";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
