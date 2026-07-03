import type { GeoPolygon } from "./geo-filter";

export interface SavedMapPolygon {
  id: string;
  name: string;
  city: string;
  points: GeoPolygon;
  createdAt: string;
}

const STORAGE_KEY = "listing-map-polygons";

function storageKey(city: string): string {
  return `${STORAGE_KEY}:${city.trim().toLowerCase()}`;
}

function readStore(): Record<string, SavedMapPolygon[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SavedMapPolygon[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, SavedMapPolygon[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function loadSavedMapPolygons(city: string): SavedMapPolygon[] {
  const key = storageKey(city);
  const store = readStore();
  return Array.isArray(store[key]) ? store[key] : [];
}

export function saveMapPolygon(city: string, name: string, points: GeoPolygon): SavedMapPolygon {
  const key = storageKey(city);
  const store = readStore();
  const existing = Array.isArray(store[key]) ? store[key] : [];
  const entry: SavedMapPolygon = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || `Area ${existing.length + 1}`,
    city: city.trim(),
    points,
    createdAt: new Date().toISOString(),
  };
  store[key] = [entry, ...existing];
  writeStore(store);
  return entry;
}

export function deleteSavedMapPolygon(city: string, id: string): SavedMapPolygon[] {
  const key = storageKey(city);
  const store = readStore();
  const existing = Array.isArray(store[key]) ? store[key] : [];
  store[key] = existing.filter((p) => p.id !== id);
  writeStore(store);
  return store[key];
}
