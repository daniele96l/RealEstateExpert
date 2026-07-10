import type { CityListingsCache, MapListing } from "@/lib/types";
import type { BatchFetchProgressCallback } from "@/lib/batch-fetch-progress";
import { citySlugVariants, geocodeCity, normalizeCitySlug } from "./geocode";
import {
  IdealistaSearchError,
  buildIdealistaSearchUrl,
  parseListingCards,
  parseMapSearchHtml,
} from "./idealista-search";
import { withIdealistaBrowser } from "./idealista-browser";

function mergeListingMaps(existing: MapListing[], incoming: MapListing[]): MapListing[] {
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const listing of incoming) byId.set(listing.id, listing);
  return [...byId.values()];
}

export async function fetchCityListingsViaDirect(
  city: string,
  operation: "sale" | "rent",
  maxPages = 1,
  onPage?: BatchFetchProgressCallback,
  opts?: { forceNavigation?: boolean },
): Promise<CityListingsCache> {
  const centerData = await geocodeCity(city);

  return withIdealistaBrowser(async (session) => {
    let listings: MapListing[] = [];
    let lastError: unknown;

    for (const slug of citySlugVariants(city)) {
      for (let page = 1; page <= maxPages; page++) {
        const beforeCount = listings.length;
        for (const mapView of [true, false]) {
          try {
            const url = buildIdealistaSearchUrl(slug, operation, mapView, page);
            let html = await session.fetchHtml(url, { forceNavigation: opts?.forceNavigation });
            let pageListings = parseMapSearchHtml(html, operation);
            if (!pageListings.length) {
              const cards = parseListingCards(html, operation);
              if (cards.length) pageListings = cards;
            }
            if (!pageListings.length && !opts?.forceNavigation) {
              html = await session.fetchHtml(url, { forceNavigation: true });
              pageListings = parseMapSearchHtml(html, operation);
              if (!pageListings.length) {
                const cards = parseListingCards(html, operation);
                if (cards.length) pageListings = cards;
              }
            }
            if (pageListings.length) {
              listings = mergeListingMaps(listings, pageListings);
              break;
            }
          } catch (err) {
            lastError = err;
          }
        }
        if (listings.length === beforeCount) break;
        onPage?.({
          operation,
          page,
          maxPages,
          listingsTotal: listings.length,
        });
      }
      if (listings.length) break;
    }

    if (!listings.length) {
      if (lastError) throw new IdealistaSearchError(`Idealista diretto: ${lastError}`);
      throw new IdealistaSearchError(`Nessun annuncio Idealista trovato per ${city}`);
    }

    return {
      city: normalizeCitySlug(city),
      operation,
      fetched_at: new Date().toISOString(),
      center: {
        lat: centerData.lat,
        lng: centerData.lng,
        display_name: centerData.display_name ?? null,
      },
      listings,
      provider: "direct",
    };
  });
}
