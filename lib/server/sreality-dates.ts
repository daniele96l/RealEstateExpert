export interface SrealityListingDates {
  listing_published_at: string | null;
  listing_updated_at: string | null;
}

export interface SrealityDateSource {
  since?: string | null;
  edited?: string | null;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeDateString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const match = ISO_DATE_RE.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

export function extractSrealityListingDates(
  source: SrealityDateSource | null | undefined,
): SrealityListingDates {
  return {
    listing_published_at: normalizeDateString(source?.since),
    listing_updated_at: normalizeDateString(source?.edited),
  };
}

export function srealityEstateIdFromListingId(id: string): number | null {
  const match = /^sr_(\d+)$/.exec(id.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
