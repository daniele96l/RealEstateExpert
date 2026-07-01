import type { CityListingsCache, ListingsProvider } from "./types";

async function parseError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { detail?: string; error?: string };
    if (body.detail) return body.detail;
    if (body.error) return body.error;
  } catch {
    if (text) return text;
  }
  return fallback;
}

export async function importFromIdealista(
  url: string,
  provider?: ListingsProvider,
): Promise<CityListingsCache> {
  const res = await fetch("/api/import/idealista", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, provider }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Importazione non riuscita"));
  return res.json();
}

export async function fetchListings(
  city: string,
  operation: "sale" | "rent",
  refresh = false,
  provider?: ListingsProvider,
): Promise<CityListingsCache> {
  const res = await fetch("/api/listings/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, operation, refresh, provider }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Caricamento annunci non riuscito"));
  return res.json();
}

export async function getListingsProviders(): Promise<{
  default_provider: ListingsProvider;
  scrapingbee: boolean;
  rapidapi: boolean;
}> {
  const res = await fetch("/api/listings/fetch");
  if (!res.ok) throw new Error("Impossibile leggere configurazione provider");
  return res.json();
}

export async function getCachedListings(
  city: string,
  operation: "sale" | "rent",
): Promise<CityListingsCache | null> {
  const res = await fetch(`/api/listings/${encodeURIComponent(city)}/${operation}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res, "Errore lettura cache"));
  return res.json();
}
