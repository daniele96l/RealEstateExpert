import { loadEnvLocal } from "../lib/server/load-env";
import { fetchApifyImmobiliareListings } from "../lib/server/apify-immobiliare";
import { enrichImmobiliareListingDates } from "../lib/server/immobiliare-listing-dates-fetch";

loadEnvLocal();

async function main() {
  const maxPages = Number(process.argv[2] ?? 2);
  const { cache, actorId } = await fetchApifyImmobiliareListings(maxPages, (p) => {
    console.log(
      `[progress] ${p.phase ?? "page"} ${p.page}/${p.maxPages} listings=${p.listingsTotal}`,
    );
  });

  const enriched = await enrichImmobiliareListingDates(cache.listings, (p) => {
    if (p.phase === "enrich") {
      console.log(`[enrich] ${p.enrichDone}/${p.enrichTotal}`);
    }
  });

  const withPublished = enriched.filter((l) => l.listing_published_at).length;
  const withUpdated = enriched.filter((l) => l.listing_updated_at).length;

  console.log(
    JSON.stringify(
      {
        actorId,
        provider: cache.provider,
        fetched_at: cache.fetched_at,
        total: enriched.length,
        withPublished,
        withUpdated,
        sample: enriched.slice(0, 5).map((l) => ({
          id: l.id,
          price: l.price,
          lat: l.lat,
          lng: l.lng,
          published: l.listing_published_at,
          updated: l.listing_updated_at,
          url: l.url,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
