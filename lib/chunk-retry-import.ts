const CHUNK_ERROR_RE =
  /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;

/** Retry once after stale dev/prod chunk URLs (e.g. .next cleared while tab is open). */
export function importWithChunkRetry<T>(
  loader: () => Promise<T>,
  storageKey: string,
): Promise<T> {
  return loader()
    .then((mod) => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(storageKey);
      }
      return mod;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (
        typeof window !== "undefined" &&
        CHUNK_ERROR_RE.test(message) &&
        !sessionStorage.getItem(storageKey)
      ) {
        sessionStorage.setItem(storageKey, "1");
        window.location.reload();
        return new Promise<T>(() => {});
      }
      throw error;
    });
}
