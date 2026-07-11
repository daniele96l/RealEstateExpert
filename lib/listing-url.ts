export type ListingSource = "idealista" | "immobiliare" | "sreality";
export type ListingWebsiteSource = ListingSource | "casa" | "subito";
export type ListingsWebsiteSource = ListingSource | "mixed" | "casa" | "subito";

export function isCasaListingUrl(url: string): boolean {
  return /casa\.it\/immobili\/\d+/i.test(url);
}

export function isSubitoListingUrl(url: string): boolean {
  return /subito\.it\/.+\-\d+\.htm/i.test(url);
}

export function casaListingCacheId(numericId: string): string {
  return `ca_${numericId}`;
}

export function subitoListingCacheId(numericId: string): string {
  return `sb_${numericId}`;
}

export function inferListingWebsiteSource(listing: { id: string; url: string }): ListingWebsiteSource | null {
  if (listing.id.startsWith("sr_") || /sreality\.cz/i.test(listing.url)) return "sreality";
  if (listing.id.startsWith("im_") || isImmobiliareListingUrl(listing.url)) return "immobiliare";
  if (listing.id.startsWith("ca_") || isCasaListingUrl(listing.url)) return "casa";
  if (listing.id.startsWith("sb_") || isSubitoListingUrl(listing.url)) return "subito";
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
  let sreality = false;
  let casa = false;
  let subito = false;
  for (const listing of listings) {
    const source = inferListingWebsiteSource(listing);
    if (source === "idealista") idealista = true;
    if (source === "immobiliare") immobiliare = true;
    if (source === "sreality") sreality = true;
    if (source === "casa") casa = true;
    if (source === "subito") subito = true;
  }
  const count = [idealista, immobiliare, sreality, casa, subito].filter(Boolean).length;
  if (count > 1) return "mixed";
  if (sreality) return "sreality";
  if (immobiliare) return "immobiliare";
  if (casa) return "casa";
  if (subito) return "subito";
  if (idealista) return "idealista";
  return "idealista";
}

export function formatListingsWebsiteSource(source: ListingsWebsiteSource | null): string | null {
  if (!source) return null;
  if (source === "idealista") return "Idealista";
  if (source === "immobiliare") return "Immobiliare.it";
  if (source === "sreality") return "Sreality.cz";
  if (source === "casa") return "Casa.it";
  if (source === "subito") return "Subito.it";
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
  const casaId = url.match(/casa\.it\/immobili\/(\d+)/i)?.[1];
  if (casaId) return casaListingCacheId(casaId);
  const subitoId = url.match(/-(\d+)\.htm/i)?.[1];
  if (subitoId && /subito\.it/i.test(url)) return subitoListingCacheId(subitoId);
  return null;
}

/** Best-effort portal URL from occupancy listing id (and optional stored url). */
export function resolveOccupancyListingUrl(
  listing: { id: string; url?: string | null },
): string | null {
  const stored = listing.url?.trim();
  if (stored) {
    try {
      return new URL(stored.startsWith("http") ? stored : `https://${stored}`).toString();
    } catch {
      // fall through to id-based resolution
    }
  }

  const id = listing.id.trim();
  if (id.startsWith("im_")) {
    const numericId = id.slice(3);
    if (/^\d+$/.test(numericId)) return `https://www.immobiliare.it/annunci/${numericId}/`;
  }
  if (/^\d+$/.test(id)) return `https://www.idealista.it/immobile/${id}/`;
  if (id.startsWith("sr_")) {
    const numericId = id.slice(3);
    if (/^\d+$/.test(numericId)) return `https://www.sreality.cz/detail/pronajem/byt/-/-/${numericId}`;
  }
  if (id.startsWith("ca_")) {
    const numericId = id.slice(3);
    if (/^\d+$/.test(numericId)) return `https://www.casa.it/immobili/${numericId}/`;
  }
  if (id.startsWith("sb_")) {
    const numericId = id.slice(3);
    if (/^\d+$/.test(numericId)) return `https://www.subito.it/annunci-${numericId}.htm`;
  }
  return null;
}

export function normalizeIdealistaListingUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL obbligatorio");

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("URL non valido");
  }

  if (!parsed.hostname.includes("idealista.it")) {
    throw new Error("Inserisci un URL Idealista italiano (idealista.it)");
  }

  const idMatch = parsed.pathname.match(/\/immobile\/(\d+)/);
  if (!idMatch) {
    throw new Error("URL non riconosciuto — usa un link del tipo idealista.it/immobile/12345678/");
  }

  return `https://www.idealista.it/immobile/${idMatch[1]}/`;
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
