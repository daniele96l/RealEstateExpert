import { isIdealistaListingUrl, isImmobiliareListingUrl } from "@/lib/listing-url";
import type { ListingDetail, MapListing } from "@/lib/types";
import { fetchImmobiliareListingDetail } from "./immobiliare-import";
import { fetchPropertyDetailsViaScrape, IdealistaImportError } from "./idealista-import";
import { listingToDetail } from "./property-detail";
import { fetchPropertyDetailForSrealityListing, isSrealityListing } from "./sreality-detail";

export async function fetchPropertyDetailForListing(listing: MapListing): Promise<ListingDetail> {
  const url = listing.url?.trim();
  if (!url) throw new Error("URL annuncio mancante");

  if (isSrealityListing(listing)) {
    return fetchPropertyDetailForSrealityListing(listing);
  }

  if (isImmobiliareListingUrl(url)) {
    return fetchImmobiliareListingDetail(url);
  }

  if (isIdealistaListingUrl(url) || /^\d+$/.test(listing.id)) {
    const idealistaUrl =
      url || `https://www.idealista.it/immobile/${listing.id.replace(/^id_/, "")}/`;
    const mapListing = await fetchPropertyDetailsViaScrape(idealistaUrl);
    return listingToDetail({ ...mapListing, ...listing, id: mapListing.id || listing.id });
  }

  if (listing.id) return listingToDetail(listing);
  throw new IdealistaImportError("URL non riconosciuto");
}
