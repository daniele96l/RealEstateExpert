export type ConditionFilter =
  | "any"
  | "good"
  | "almost_new"
  | "newly_built"
  | "newdevelopment"
  | "toRestore"
  | "ruin"
  | "unknown";

export interface PropertyConditionInfo {
  condition_status: string | null;
  condition: string | null;
  needs_renovation: boolean | null;
}

const CONDITION_DEFS: Record<
  string,
  { label: string; needsRenovation: boolean; filter: ConditionFilter }
> = {
  good: { label: "Buono stato", needsRenovation: false, filter: "good" },
  almost_new: { label: "Quasi nuovo", needsRenovation: false, filter: "almost_new" },
  almostNew: { label: "Quasi nuovo", needsRenovation: false, filter: "almost_new" },
  newly_built: { label: "Di recente costruzione", needsRenovation: false, filter: "newly_built" },
  newlyBuilt: { label: "Di recente costruzione", needsRenovation: false, filter: "newly_built" },
  newdevelopment: { label: "Nuova costruzione", needsRenovation: false, filter: "newdevelopment" },
  newDevelopment: { label: "Nuova costruzione", needsRenovation: false, filter: "newdevelopment" },
  renew: { label: "Da ristrutturare", needsRenovation: true, filter: "toRestore" },
  toRestore: { label: "Da ristrutturare", needsRenovation: true, filter: "toRestore" },
  to_restore: { label: "Da ristrutturare", needsRenovation: true, filter: "toRestore" },
  needs_renovation: { label: "Da ristrutturare", needsRenovation: true, filter: "toRestore" },
  ruin: { label: "Da demolire/ricostruire", needsRenovation: true, filter: "ruin" },
};

export const CONDITION_FILTER_OPTIONS: { value: ConditionFilter; label: string }[] = [
  { value: "any", label: "Tutti" },
  { value: "good", label: "Buono stato" },
  { value: "almost_new", label: "Quasi nuovo" },
  { value: "newly_built", label: "Di recente costruzione" },
  { value: "newdevelopment", label: "Nuova costruzione" },
  { value: "toRestore", label: "Da ristrutturare" },
  { value: "ruin", label: "Da demolire/ricostruire" },
  { value: "unknown", label: "Non specificato" },
];

const STATUS_ALIASES: Record<string, string> = {
  good: "good",
  almost_new: "almost_new",
  almostnew: "almost_new",
  newly_built: "newly_built",
  newlybuilt: "newly_built",
  newdevelopment: "newdevelopment",
  new_development: "newdevelopment",
  renew: "renew",
  torestore: "toRestore",
  to_restore: "toRestore",
  needs_renovation: "toRestore",
  ruin: "ruin",
};

export function normalizeConditionStatus(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const key = raw.trim();
  return STATUS_ALIASES[key] ?? STATUS_ALIASES[key.toLowerCase()] ?? key;
}

export function conditionFromStatus(status?: string | null): PropertyConditionInfo | null {
  const normalized = normalizeConditionStatus(status);
  if (!normalized) return null;
  const def = CONDITION_DEFS[normalized];
  if (!def) return null;
  return {
    condition_status: normalized,
    condition: def.label,
    needs_renovation: def.needsRenovation,
  };
}

export function inferConditionFromText(text: string): PropertyConditionInfo | null {
  const lower = text.toLowerCase();
  if (
    /da\s+ristrutturar|da\s+restaurar|da\s+demolir|da\s+ricostruir|needs?\s+renovation|to\s*restore/.test(
      lower,
    )
  ) {
    return conditionFromStatus("toRestore");
  }
  if (/quasi\s+nuov/.test(lower)) return conditionFromStatus("almost_new");
  if (/di\s+recente\s+costruzion|nuov[ao]\s+edific|nuova\s+costruzione|new\s+development/.test(lower)) {
    return conditionFromStatus("newdevelopment");
  }
  if (/ristrutturat/.test(lower)) return conditionFromStatus("good");
  if (/ottimo\s+stato|buono\s+stato|good\s+condition/.test(lower)) {
    return conditionFromStatus("good");
  }
  return null;
}

export function resolvePropertyCondition(
  status?: string | null,
  text?: string | null,
): PropertyConditionInfo {
  return (
    conditionFromStatus(status) ??
    (text ? inferConditionFromText(text) : null) ?? {
      condition_status: null,
      condition: null,
      needs_renovation: null,
    }
  );
}

export function listingConditionFilter(
  listing: Pick<MapListingConditionFields, "condition_status" | "condition" | "needs_renovation">,
): ConditionFilter {
  if (listing.condition_status) {
    const def = CONDITION_DEFS[listing.condition_status];
    if (def) return def.filter;
  }
  if (listing.condition) {
    const match = Object.values(CONDITION_DEFS).find((def) => def.label === listing.condition);
    if (match) return match.filter;
  }
  if (listing.needs_renovation === true) return "toRestore";
  if (listing.needs_renovation === false) return "good";
  return "unknown";
}

export interface MapListingConditionFields {
  condition_status: string | null;
  condition: string | null;
  needs_renovation: boolean | null;
}

export function matchesConditionFilter(
  listing: MapListingConditionFields,
  filter: ConditionFilter,
): boolean {
  if (filter === "any") return true;
  const normalized = {
    condition_status: listing.condition_status ?? null,
    condition: listing.condition ?? null,
    needs_renovation: listing.needs_renovation ?? null,
  };
  if (filter === "unknown") {
    return (
      normalized.condition_status == null &&
      normalized.condition == null &&
      normalized.needs_renovation == null
    );
  }
  return listingConditionFilter(normalized) === filter;
}

export function listingConditionLabel(
  listing: Pick<MapListingConditionFields, "condition_status" | "condition" | "needs_renovation">,
): string | null {
  if (listing.condition?.trim()) return listing.condition.trim();
  if (listing.condition_status) {
    const def = CONDITION_DEFS[listing.condition_status];
    if (def) return def.label;
  }
  if (listing.needs_renovation === true) return "Da ristrutturare";
  if (listing.needs_renovation === false) return "Buono stato";
  return null;
}

export function conditionBadgeClass(needsRenovation: boolean | null | undefined): string {
  if (needsRenovation === true) return "bg-amber-500/15 text-amber-400";
  if (needsRenovation === false) return "bg-emerald-500/15 text-emerald-400";
  return "bg-slate-500/15 text-slate-400";
}
