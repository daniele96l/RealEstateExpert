export type ListingSource = "idealista" | "immobiliare";
export type ListingsWebsiteSource = ListingSource | "mixed";

export function inferListingWebsiteSource(listing: { id: string; url: string }): ListingSource | null {
  if (listing.id.startsWith("im_") || isImmobiliareListingUrl(listing.url)) return "immobiliare";
  if (isIdealistaListingUrl(listing.url) || /idealista\.it/i.test(listing.url)) return "idealista";
  if (/^\d+$/.test(listing.id)) return "idealista";
  return null;
}

export function inferListingsWebsiteSource(
  listings: Array<{ id: string; url: string }>,
): ListingsWebsiteSource | null {
  if (!listings.length) return null;
  let idealista = false;
  let immobiliare = false;
  for (const listing of listings) {
    const source = inferListingWebsiteSource(listing);
    if (source === "idealista") idealista = true;
    if (source === "immobiliare") immobiliare = true;
  }
  if (idealista && immobiliare) return "mixed";
  if (immobiliare) return "immobiliare";
  if (idealista) return "idealista";
  return "idealista";
}

export function formatListingsWebsiteSource(source: ListingsWebsiteSource | null): string | null {
  if (!source) return null;
  if (source === "idealista") return "Idealista";
  if (source === "immobiliare") return "Immobiliare.it";
  return "Idealista + Immobiliare.it";
}

export function isIdealistaListingUrl(url: string): boolean {
  return /idealista\.it\/immobile\/\d+/i.test(url);
}

export function isImmobiliareListingUrl(url: string): boolean {
  return /immobiliare\.it\/annunci\/\d+/i.test(url);
}

export function detectListingSource(url: string): ListingSource | null {
  if (isIdealistaListingUrl(url)) return "idealista";
  if (isImmobiliareListingUrl(url)) return "immobiliare";
  return null;
}

export function extractIdealistaListingId(url: string): string | null {
  return url.match(/\/immobile\/(\d+)/)?.[1] ?? null;
}

export function extractImmobiliareListingId(url: string): string | null {
  return url.match(/\/annunci\/(\d+)/)?.[1] ?? null;
}

export function immobiliareListingCacheId(numericId: string): string {
  return `im_${numericId}`;
}

export function extractListingCacheId(url: string): string | null {
  const idealistaId = extractIdealistaListingId(url);
  if (idealistaId) return idealistaId;
  const immobiliareId = extractImmobiliareListingId(url);
  if (immobiliareId) return immobiliareListingCacheId(immobiliareId);
  return null;
}

export function normalizeImmobiliareListingUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL obbligatorio");

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("URL non valido");
  }

  if (!parsed.hostname.includes("immobiliare.it")) {
    throw new Error("Inserisci un URL Immobiliare italiano (immobiliare.it)");
  }

  const idMatch = parsed.pathname.match(/\/annunci\/(\d+)/);
  if (!idMatch) {
    throw new Error("URL non riconosciuto — usa un link del tipo immobiliare.it/annunci/12345678/");
  }

  return `https://www.immobiliare.it/annunci/${idMatch[1]}/`;
}
