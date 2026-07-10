import { detectListingSource } from "@/lib/listing-url";
import type { CityListingsCache } from "@/lib/types";
import { IdealistaImportError, importListingFromUrl as importIdealistaListingFromUrl } from "./idealista-import";
import { ImmobiliareImportError, importImmobiliareListingFromUrl } from "./immobiliare-import";

export { IdealistaImportError, ImmobiliareImportError };

export async function importListingFromAnyUrl(url: string): Promise<CityListingsCache> {
  const source = detectListingSource(url);
  if (source === "immobiliare") {
    return importImmobiliareListingFromUrl(url);
  }
  if (source === "idealista") {
    return importIdealistaListingFromUrl(url);
  }
  throw new IdealistaImportError(
    "URL non supportato. Incolla un link Idealista (idealista.it/immobile/…) o Immobiliare (immobiliare.it/annunci/…).",
  );
}
