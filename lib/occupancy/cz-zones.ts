import { OCCUPANCY_FALLBACK_ZONE } from "./constants";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function resolveCzechZone(address: string | null, cityName: string): string {
  if (!address?.trim()) return OCCUPANCY_FALLBACK_ZONE;

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? OCCUPANCY_FALLBACK_ZONE;

  const cityToken = normalizeText(cityName).split(/\s+/)[0] ?? "";
  const last = normalizeText(parts[parts.length - 1]!);

  if (cityToken && last.includes(cityToken)) {
    return parts[parts.length - 2] ?? OCCUPANCY_FALLBACK_ZONE;
  }

  return parts[parts.length - 2] ?? parts[0] ?? OCCUPANCY_FALLBACK_ZONE;
}
