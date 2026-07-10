import {
  getOccupancyCityConfig,
  type OccupancyCitySlug,
  defaultOccupancyCitySlug,
} from "./cities";

export type OccupancyPortal =
  | "immobiliare_scraper"
  | "idealista_scraper"
  | "casa_scraper"
  | "subito_scraper"
  | "sreality";

export const OCCUPANCY_PORTALS: OccupancyPortal[] = [
  "immobiliare_scraper",
  "idealista_scraper",
  "casa_scraper",
  "subito_scraper",
  "sreality",
];

export const OCCUPANCY_SCRAPER_PORTALS: OccupancyPortal[] = [
  "immobiliare_scraper",
  "idealista_scraper",
  "casa_scraper",
  "subito_scraper",
];

export function isOccupancyScraperPortal(portal: OccupancyPortal): boolean {
  return OCCUPANCY_SCRAPER_PORTALS.includes(portal);
}

export const DEFAULT_OCCUPANCY_PORTAL: OccupancyPortal = "idealista_scraper";

export function isOccupancyPortal(value: string | null | undefined): value is OccupancyPortal {
  return OCCUPANCY_PORTALS.includes(value as OccupancyPortal);
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
