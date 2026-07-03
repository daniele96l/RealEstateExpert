import { detectListingSource } from "@/lib/listing-url";
import type { CityListingsCache, ListingsProvider } from "@/lib/types";
import { IdealistaImportError, importListingFromUrl as importIdealistaListingFromUrl } from "./idealista-import";
import { ImmobiliareImportError, importImmobiliareListingFromUrl } from "./immobiliare-import";

export { IdealistaImportError, ImmobiliareImportError };

export async function importListingFromAnyUrl(
  url: string,
  preferred: ListingsProvider,
  hasRapidApi: boolean,
  hasScrapingBee: boolean,
): Promise<CityListingsCache> {
  const source = detectListingSource(url);
  if (source === "immobiliare") {
    return importImmobiliareListingFromUrl(url, hasScrapingBee);
  }
  if (source === "idealista") {
    return importIdealistaListingFromUrl(url, preferred, hasRapidApi, hasScrapingBee);
  }
  throw new IdealistaImportError(
    "URL non supportato. Incolla un link Idealista (idealista.it/immobile/…) o Immobiliare (immobiliare.it/annunci/…).",
  );
}
