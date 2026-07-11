import { NextResponse } from "next/server";
import { resolveOccupancyCitySlug } from "@/lib/occupancy/constants";
import { resolveOccupancyPortal } from "@/lib/occupancy/portals";
import { resolveListingsPreview } from "@/lib/occupancy/listings-preview";
import { loadAllSnapshots } from "@/lib/occupancy/registry";
import { runOccupancySnapshot } from "@/lib/occupancy/snapshot";

export const maxDuration = 300;

function snapshotErrorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Snapshot non riuscito";
  return NextResponse.json({ detail: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      portal?: string;
      city?: string;
      stream?: boolean;
    };
    const citySlug = resolveOccupancyCitySlug(body.city);
    const portal = resolveOccupancyPortal(body.portal, citySlug);

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await runOccupancySnapshot(
              portal,
              (progress) => {
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: "progress", ...progress })}\n`));
              },
              { citySlug },
            );
            const snapshots = await loadAllSnapshots(citySlug, result.registry.portal);
            const listings_preview = await resolveListingsPreview(
              citySlug,
              result.registry.portal,
              snapshots,
              result.registry.last_provider ?? null,
            );
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "done",
                  result: {
                    metrics: result.metrics,
                    listings_preview,
                    fetched_count: result.fetched_count,
                    new_count: result.new_count,
                    rented_count: result.rented_count,
                    snapshot_count: result.registry.snapshot_count,
                    portal_dates_warning: result.portal_dates_warning ?? null,
                  },
                })}\n`,
              ),
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : "Snapshot non riuscito";
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await runOccupancySnapshot(portal, undefined, { citySlug });
    const snapshots = await loadAllSnapshots(citySlug, result.registry.portal);
    const listings_preview = await resolveListingsPreview(
      citySlug,
      result.registry.portal,
      snapshots,
      result.registry.last_provider ?? null,
    );
    return NextResponse.json({
      metrics: result.metrics,
      listings_preview,
      fetched_count: result.fetched_count,
      new_count: result.new_count,
      rented_count: result.rented_count,
      snapshot_count: result.registry.snapshot_count,
      portal_dates_warning: result.portal_dates_warning ?? null,
    });
  } catch (err) {
    return snapshotErrorResponse(err);
  }
}
