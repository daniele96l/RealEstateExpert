import type { ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import { fetchPropertyDetailsViaScrapingBee } from "./idealista-import";
import { listingToDetail } from "./property-detail";
import {
  getDefaultListingsProvider,
  hasRapidApiKey,
  hasScrapingBeeKey,
} from "./config";
import { fetchPropertyDetailsByUrl as fetchRapidDetail } from "./rapidapi-idealista";

async function fetchDetail(
  url: string,
  provider: ListingsProvider,
  base?: MapListing,
): Promise<ListingDetail> {
  if (provider === "rapidapi") {
    return fetchRapidDetail(url, base);
  }
  const listing = await fetchPropertyDetailsViaScrapingBee(url);
  return listingToDetail({ ...listing, ...base, id: listing.id || base?.id || "" });
}

export async function fetchPropertyDetailForListing(
  listing: MapListing,
  preferredProvider?: ListingsProvider,
): Promise<ListingDetail> {
  const url = listing.url?.trim();
  if (!url) throw new Error("URL annuncio mancante");

  const preferred = preferredProvider ?? getDefaultListingsProvider();
  const order: ListingsProvider[] =
    preferred === "rapidapi" ? ["rapidapi", "scrapingbee"] : ["scrapingbee", "rapidapi"];
  const available = order.filter((p) => (p === "rapidapi" ? hasRapidApiKey() : hasScrapingBeeKey()));

  if (!available.length) {
    throw new Error("Nessuna API configurata. Aggiungi RAPIDAPI_KEY o SCRAPINGBEE_API_KEY in .env.local");
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      return await fetchDetail(url, provider, listing);
    } catch (err) {
      lastError = err;
    }
  }

  if (listing.id) return listingToDetail(listing);
  throw lastError instanceof Error ? lastError : new Error("Dettaglio annuncio non disponibile");
}
