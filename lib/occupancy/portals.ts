export type OccupancyPortal = "idealista" | "immobiliare" | "immobiliare_scraper";

export const OCCUPANCY_PORTALS: OccupancyPortal[] = [
  "idealista",
  "immobiliare",
  "immobiliare_scraper",
];

export const DEFAULT_OCCUPANCY_PORTAL: OccupancyPortal = "idealista";

export function isOccupancyPortal(value: string | null | undefined): value is OccupancyPortal {
  return value === "idealista" || value === "immobiliare" || value === "immobiliare_scraper";
}
