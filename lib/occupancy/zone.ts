import { inferZoneFromAddress } from "@/lib/similar-listings";
import { OCCUPANCY_FALLBACK_ZONE } from "./constants";

export function resolveListingZone(address: string | null): string {
  return inferZoneFromAddress(address) ?? OCCUPANCY_FALLBACK_ZONE;
}
