import { getScrapingBeeKey } from "./config";

const SCRAPINGBEE_BASE = "https://app.scrapingbee.com/api/v1";

export class ScrapingBeeError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

type FetchParams = Record<string, string>;

const ATTEMPTS: { params: FetchParams; timeoutMs: number; label: string }[] = [
  {
    label: "premium",
    timeoutMs: 90_000,
    params: {
      premium_proxy: "true",
      country_code: "IT",
      render_js: "true",
      block_ads: "true",
      block_resources: "false",
      wait: "3000",
    },
  },
  {
    label: "stealth",
    timeoutMs: 120_000,
    params: {
      stealth_proxy: "true",
      country_code: "IT",
      render_js: "true",
      block_resources: "false",
      wait: "5000",
    },
  },
];

async function fetchOnce(url: string, extra: FetchParams, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({ url, ...extra });
  const response = await fetch(`${SCRAPINGBEE_BASE}?${params}`, {
    headers: { Authorization: `Bearer ${getScrapingBeeKey()}` },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();

  if (response.status === 401) throw new ScrapingBeeError("Chiave ScrapingBee non valida", 401);
  if (response.status === 403) throw new ScrapingBeeError("Accesso bloccato da Idealista o ScrapingBee", 403);
  if (!response.ok) {
    throw new ScrapingBeeError(
      `ScrapingBee (${response.status}): ${text.slice(0, 300)}`,
      response.status,
    );
  }

  if (text.includes('"error"') && text.includes("Server responded with")) {
    throw new ScrapingBeeError(`Idealista ha bloccato la richiesta: ${text.slice(0, 200)}`);
  }

  return text;
}

export async function fetchUrl(url: string): Promise<string> {
  const errors: string[] = [];

  for (const attempt of ATTEMPTS) {
    try {
      return await fetchOnce(url, attempt.params, attempt.timeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${attempt.label}: ${msg}`);
      if (err instanceof ScrapingBeeError && err.statusCode === 401) throw err;
    }
  }

  throw new ScrapingBeeError(
    `Impossibile scaricare la pagina Idealista. ${errors.join(" | ")}`,
  );
}
