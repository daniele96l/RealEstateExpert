export interface ImmobiliareListingDates {
  listing_published_at: string | null;
  listing_updated_at: string | null;
}

const ITALIAN_DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDateFromParts(year: number, month: number, day: number): string | null {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normalizeUnixTimestamp(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const ms = value > 1e12 ? value : value * 1000;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseItalianDateString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = ITALIAN_DATE_RE.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return isoDateFromParts(year, month, day);
}

function readUnixField(source: Record<string, unknown>, key: string): string | null {
  return normalizeUnixTimestamp(source[key]);
}

function readUpdatedFromSource(source: Record<string, unknown>): string | null {
  const fromLastUpdate = parseItalianDateString(source.lastUpdate);
  if (fromLastUpdate) return fromLastUpdate;

  for (const value of Object.values(source)) {
    if (typeof value !== "string") continue;
    if (!/aggiornato/i.test(value)) continue;
    const parsed = parseItalianDateString(value);
    if (parsed) return parsed;
  }

  return null;
}

function readPublishedFromSource(source: Record<string, unknown>): string | null {
  return readUnixField(source, "creationDate");
}

export function extractImmobiliareListingDates(
  re: unknown,
  propertyRow?: unknown,
): ImmobiliareListingDates {
  const sources = [asRecord(re), asRecord(propertyRow)].filter(
    (source): source is Record<string, unknown> => Boolean(source),
  );

  let listing_published_at: string | null = null;
  let listing_updated_at: string | null = null;

  for (const source of sources) {
    if (!listing_published_at) {
      listing_published_at = readPublishedFromSource(source);
    }
  }

  for (const source of sources) {
    const fromModified = readUnixField(source, "lastModified");
    if (fromModified) {
      listing_updated_at = fromModified;
      break;
    }
  }

  if (!listing_updated_at) {
    for (const source of sources) {
      const fromLastUpdate = readUpdatedFromSource(source);
      if (fromLastUpdate) {
        listing_updated_at = fromLastUpdate;
        break;
      }
    }
  }

  return { listing_published_at, listing_updated_at };
}
