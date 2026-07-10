import type { MarketId } from "@/lib/markets";
import type { OccupancyPortal } from "./portals";

export type OccupancyCitySlug = "reggio_calabria" | "brno";

export const OCCUPANCY_CITY_STORAGE_KEY = "occupancy-city";

export interface OccupancyCityConfig {
  slug: OccupancyCitySlug;
  city: string;
  market: MarketId;
  portals: OccupancyPortal[];
  defaultPortal: OccupancyPortal;
  mapCenter: [number, number];
  zoneResolver: "reggio" | "brno";
}

const OCCUPANCY_CITIES: Record<OccupancyCitySlug, OccupancyCityConfig> = {
  reggio_calabria: {
    slug: "reggio_calabria",
    city: "Reggio Calabria",
    market: "it",
    portals: ["immobiliare_scraper", "idealista_scraper", "casa_scraper", "subito_scraper"],
    defaultPortal: "idealista_scraper",
    mapCenter: [38.111, 15.648],
    zoneResolver: "reggio",
  },
  brno: {
    slug: "brno",
    city: "Brno",
    market: "cz",
    portals: ["sreality"],
    defaultPortal: "sreality",
    mapCenter: [49.195, 16.608],
    zoneResolver: "brno",
  },
};

export const OCCUPANCY_CITY_SLUGS = Object.keys(OCCUPANCY_CITIES) as OccupancyCitySlug[];

export function defaultOccupancyCitySlug(): OccupancyCitySlug {
  return "reggio_calabria";
}

export function isOccupancyCitySlug(value: string | null | undefined): value is OccupancyCitySlug {
  return value === "reggio_calabria" || value === "brno";
}

export function resolveOccupancyCitySlug(value: string | null | undefined): OccupancyCitySlug {
  return isOccupancyCitySlug(value) ? value : defaultOccupancyCitySlug();
}

export function getOccupancyCityConfig(slug: OccupancyCitySlug): OccupancyCityConfig {
  return OCCUPANCY_CITIES[slug];
}

export function isOccupancyCityAllowed(city: string): boolean {
  const normalized = city.trim().toLowerCase();
  return Object.values(OCCUPANCY_CITIES).some((cfg) => cfg.city.toLowerCase() === normalized);
}
