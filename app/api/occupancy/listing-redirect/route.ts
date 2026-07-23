import { NextResponse } from "next/server";
import { srealityEstateIdFromListingId } from "@/lib/server/sreality-dates";

export const maxDuration = 30;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface SrealityEstatePayload {
  result?: {
    name?: string | null;
    price_czk?: number | null;
    priceCzk?: number | null;
    description?: string | null;
    category_type_cb?: { name?: string | null } | null;
    category_sub_cb?: { name?: string | null } | null;
    locality?: {
      city?: string | null;
      citypart?: string | null;
      street?: string | null;
      city_seo_name?: string | null;
      citypart_seo_name?: string | null;
      street_seo_name?: string | null;
    } | null;
  } | null;
}

function buildDetailUrl(estateId: number, estate: NonNullable<SrealityEstatePayload["result"]>): string {
  const operation = estate.category_type_cb?.name === "Pronájem" ? "pronajem" : "prodej";
  const rooms = encodeURIComponent(estate.category_sub_cb?.name ?? "byt").replace(/%2B/g, "+");
  const slug =
    [estate.locality?.city_seo_name, estate.locality?.citypart_seo_name, estate.locality?.street_seo_name]
      .filter(Boolean)
      .join("-") || "_";
  return `https://www.sreality.cz/detail/${operation}/byt/${rooms}/${slug}/${estateId}?noredirect=1`;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Verifies a Sreality estate still exists, then shows a same-origin bridge page
 * with live listing details + a link to Sreality (avoids broken slugs / login loops
 * that break Cursor preview and some browsers).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ detail: "Missing id" }, { status: 400 });
  }

  const estateId = srealityEstateIdFromListingId(id);
  if (!estateId) {
    return NextResponse.json({ detail: "Not a Sreality listing id" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://www.sreality.cz/api/v1/estates/${estateId}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        Referer: "https://www.sreality.cz/",
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return htmlPage(
        404,
        "Listing no longer available",
        `<p>Sreality estate <code>${estateId}</code> was not found (removed or expired).</p>
         <p><a href="javascript:history.back()">Go back</a></p>`,
      );
    }

    const payload = (await response.json()) as SrealityEstatePayload;
    const estate = payload.result;
    if (!estate) {
      return htmlPage(
        404,
        "Listing no longer available",
        `<p>Sreality estate <code>${estateId}</code> has no detail payload.</p>
         <p><a href="javascript:history.back()">Go back</a></p>`,
      );
    }

    const detailUrl = buildDetailUrl(estateId, estate);
    const price = estate.price_czk ?? estate.priceCzk;
    const address = [estate.locality?.street, estate.locality?.citypart, estate.locality?.city]
      .filter(Boolean)
      .join(", ");
    const title = estate.name?.trim() || estate.category_sub_cb?.name || `Estate ${estateId}`;
    const typeLabel = estate.category_sub_cb?.name ?? "—";

    return htmlPage(
      200,
      title,
      `<p class="ok">Verified live on Sreality API</p>
       <h1>${esc(title)}</h1>
       <dl>
         <div><dt>Price</dt><dd>${price != null ? `${Number(price).toLocaleString("cs-CZ")} Kč` : "—"}</dd></div>
         <div><dt>Type</dt><dd>${esc(typeLabel)}</dd></div>
         <div><dt>Address</dt><dd>${esc(address || "—")}</dd></div>
         <div><dt>ID</dt><dd><code>${estateId}</code></dd></div>
       </dl>
       <p class="actions">
         <a class="btn" href="${esc(detailUrl)}" target="_blank" rel="noopener noreferrer">Open on Sreality</a>
         <a class="back" href="javascript:history.back()">Back</a>
       </p>`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}

function htmlPage(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:36rem;margin:2.5rem auto;padding:0 1rem;color:#171717;line-height:1.45}
h1{font-size:1.25rem;margin:0.5rem 0 1rem}
.ok{color:#15803d;font-size:0.85rem;font-weight:600;margin:0}
dl{display:grid;gap:0.65rem;margin:1.25rem 0}
dt{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.04em;color:#737373}
dd{margin:0.15rem 0 0;font-weight:600}
.actions{display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-top:1.5rem}
.btn{display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:0.65rem 1rem;border-radius:0.5rem;font-weight:600}
.back{color:#525252}
code{font-size:0.85em}
</style></head><body>${body}</body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}
