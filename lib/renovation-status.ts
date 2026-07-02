import {
  conditionFromStatus,
  inferConditionFromText,
  resolvePropertyCondition,
  type PropertyConditionInfo,
} from "./property-condition";

/** @deprecated Use ConditionFilter from property-condition */
export type RenovationFilter = "any" | "needs" | "no";

export function needsRenovationFromStatus(status?: string | null): boolean | null {
  return conditionFromStatus(status)?.needs_renovation ?? null;
}

export function inferNeedsRenovationFromText(text: string): boolean | null {
  return inferConditionFromText(text)?.needs_renovation ?? null;
}

export function resolveNeedsRenovation(
  status?: string | null,
  text?: string | null,
): boolean | null {
  return resolvePropertyCondition(status, text).needs_renovation;
}

export function resolveListingCondition(
  status?: string | null,
  text?: string | null,
): PropertyConditionInfo {
  return resolvePropertyCondition(status, text);
}

export function matchesRenovationFilter(
  needsRenovation: boolean | null | undefined,
  filter: RenovationFilter,
): boolean {
  if (filter === "any") return true;
  if (filter === "needs") return needsRenovation === true;
  return needsRenovation === false;
}
