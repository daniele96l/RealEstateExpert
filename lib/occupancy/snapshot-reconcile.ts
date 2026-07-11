import type { OccupancyRegistry } from "@/lib/types";
import { DEFAULT_OCCUPANCY_PORTAL, type OccupancyPortal } from "./constants";
import { defaultOccupancyCitySlug, type OccupancyCitySlug } from "./cities";
import { loadAllSnapshots, loadRegistry, saveRegistry } from "./registry";
import { rebuildRegistryFromSnapshots } from "./snapshot";

export async function reconcileOccupancyAfterSnapshotChange(
  citySlug: OccupancyCitySlug = defaultOccupancyCitySlug(),
  portal: OccupancyPortal = DEFAULT_OCCUPANCY_PORTAL,
): Promise<OccupancyRegistry> {
  const current = await loadRegistry(citySlug, portal);
  const snapshots = await loadAllSnapshots(citySlug, portal);
  const registry = rebuildRegistryFromSnapshots(
    snapshots,
    citySlug,
    portal,
    current.last_provider ?? null,
  );
  await saveRegistry(registry, citySlug, portal);
  return registry;
}
