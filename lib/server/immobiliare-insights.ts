import type { PriceHistoryPoint } from "@/lib/types";
import { getImmobiliareInsightsBaseUrl, hasImmobiliareInsightsCredentials } from "./config";
import { resolveMercatoLocation } from "./immobiliare-zone";

export class ImmobiliareInsightsError extends Error {}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

type RawHistoryPoint = { month: number; year: number; price_avg: number };

async function fetchToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const clientId = process.env.IMMOBILIARE_INSIGHTS_CLIENT_ID?.trim();
  const clientSecret = process.env.IMMOBILIARE_INSIGHTS_CLIENT_SECRET?.trim();
  const username = process.env.IMMOBILIARE_INSIGHTS_USERNAME?.trim();
  const password = process.env.IMMOBILIARE_INSIGHTS_PASSWORD?.trim();

  if (!clientId || !clientSecret || !username || !password) {
    throw new ImmobiliareInsightsError("Credenziali Immobiliare Insights non configurate");
  }

  const base = getImmobiliareInsightsBaseUrl();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ImmobiliareInsightsError(`Autenticazione Insights fallita (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 14_000) * 1000,
  };
  return data.access_token;
}

async function resolveZoneId(lat: number, lng: number, token: string): Promise<string> {
  const base = getImmobiliareInsightsBaseUrl();
  const res = await fetch(`${base}/api/taxonomies/geo/IT/hierarchy/lat/${lat}/lng/${lng}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new ImmobiliareInsightsError(`Risoluzione zona fallita (${res.status})`);
  }

  const data = (await res.json()) as {
    items?: { comune?: { id?: string } }[];
  };
  const id = data.items?.[0]?.comune?.id;
  if (!id) throw new ImmobiliareInsightsError("ID comune non trovato per le coordinate");
  return id;
}

function normalizeHistory(items: RawHistoryPoint[]): PriceHistoryPoint[] {
  return items
    .map((p) => ({
      year: p.year,
      month: p.month,
      label: new Date(p.year, p.month - 1, 1).toLocaleDateString("it-IT", {
        month: "short",
        year: "2-digit",
      }),
      price_sqm_avg: p.price_avg,
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

async function fetchPriceHistory(
  token: string,
  idZone: string,
  contract: 1 | 2,
): Promise<PriceHistoryPoint[]> {
  const now = new Date();
  const base = getImmobiliareInsightsBaseUrl();
  const res = await fetch(`${base}/api/price/history`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ty_zone: "com",
      id_zone: idZone,
      window: "1M",
      contract,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      nation: "IT",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ImmobiliareInsightsError(`Price history fallita (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    items?: { maintenance_status?: Record<string, RawHistoryPoint[]> }[];
  };

  const buckets = data.items?.[0]?.maintenance_status;
  if (!buckets) return [];

  const merged = Object.values(buckets).flat();
  const byKey = new Map<string, RawHistoryPoint>();
  for (const point of merged) {
    byKey.set(`${point.year}-${point.month}`, point);
  }

  return normalizeHistory([...byKey.values()]);
}

export async function fetchMarketHistoryViaInsights(city: string): Promise<{
  location: Awaited<ReturnType<typeof resolveMercatoLocation>>;
  sale: PriceHistoryPoint[];
  rent: PriceHistoryPoint[];
}> {
  if (!hasImmobiliareInsightsCredentials()) {
    throw new ImmobiliareInsightsError("Credenziali Immobiliare Insights non configurate");
  }

  const location = await resolveMercatoLocation(city);
  const token = await fetchToken();
  const idZone = await resolveZoneId(location.lat, location.lng, token);
  const [sale, rent] = await Promise.all([
    fetchPriceHistory(token, idZone, 1),
    fetchPriceHistory(token, idZone, 2),
  ]);

  return { location, sale, rent };
}
