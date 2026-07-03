export type ListingSource = "idealista" | "immobiliare";

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
