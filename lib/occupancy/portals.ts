import {
  getOccupancyCityConfig,
  type OccupancyCitySlug,
  defaultOccupancyCitySlug,
} from "./cities";

export type OccupancyPortal = "idealista" | "immobiliare" | "immobiliare_scraper" | "sreality";

export const OCCUPANCY_PORTALS: OccupancyPortal[] = [
  "idealista",
  "immobiliare",
  "immobiliare_scraper",
  "sreality",
];

export const DEFAULT_OCCUPANCY_PORTAL: OccupancyPortal = "idealista";

export function isOccupancyPortal(value: string | null | undefined): value is OccupancyPortal {
  return (
    value === "idealista" ||
    value === "immobiliare" ||
    value === "immobiliare_scraper" ||
    value === "sreality"
  );
}

export function portalsForCity(citySlug: OccupancyCitySlug = defaultOccupancyCitySlug()): OccupancyPortal[] {
  return getOccupancyCityConfig(citySlug).portals;
}

export function defaultPortalForCity(citySlug: OccupancyCitySlug = defaultOccupancyCitySlug()): OccupancyPortal {
  return getOccupancyCityConfig(citySlug).defaultPortal;
}

export function resolveOccupancyPortal(
  portalInput: string | null | undefined,
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
): OccupancyPortal {
  const allowed = portalsForCity(citySlug);
  if (portalInput && isOccupancyPortal(portalInput) && allowed.includes(portalInput)) {
    return portalInput;
  }
  return defaultPortalForCity(citySlug);
}
