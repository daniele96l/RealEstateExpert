import { NextResponse } from "next/server";
import { isOccupancyPortal } from "@/lib/occupancy/constants";
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
      stream?: boolean;
    };
    const portal = isOccupancyPortal(body.portal) ? body.portal : undefined;

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await runOccupancySnapshot(portal, (progress) => {
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: "progress", ...progress })}\n`));
            });
            const snapshots = await loadAllSnapshots(result.registry.portal);
            const listings_preview = await resolveListingsPreview(
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

    const result = await runOccupancySnapshot(portal);
    const snapshots = await loadAllSnapshots(result.registry.portal);
    const listings_preview = await resolveListingsPreview(
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
    });
  } catch (err) {
    return snapshotErrorResponse(err);
  }
}
