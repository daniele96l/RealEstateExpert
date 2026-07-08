let rapidapiQuotaExhausted = false;

export function isRapidApiQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("limite richieste")
  );
}

export function markRapidApiQuotaExhausted(): void {
  rapidapiQuotaExhausted = true;
}

export function shouldSkipRapidApi(): boolean {
  if (process.env.RAPIDAPI_DISABLED === "1") return true;
  return rapidapiQuotaExhausted;
}

export function noteRapidApiError(err: unknown): void {
  if (isRapidApiQuotaError(err)) markRapidApiQuotaExhausted();
}
