"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, Polygon, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Layers, Maximize2, X } from "lucide-react";
import type { OccupancyListingChangeStatus, OccupancyMapListing } from "@/lib/types";
import type { GeoPolygon } from "@/lib/geo-filter";
import {
  buildZoneOverlayStats,
  densityFillOpacity,
  priceHeatColor,
  zonePaletteColor,
  type OccupancyMapOverlayId,
} from "@/lib/occupancy/map-overlays";
import { cn, fmtMoney } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

const STATUS_COLORS: Record<OccupancyListingChangeStatus, string> = {
  still_active: "#10b981",
  new: "#38bdf8",
  removed: "#f43f5e",
};

const DEFAULT_CENTER: [number, number] = [38.111, 15.648];

const MAP_TILES = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const;

function markerIcon(status: OccupancyListingChangeStatus = "still_active") {
  const color = STATUS_COLORS[status];
  const size = status === "removed" ? 10 : 12;
  const anchor = size / 2;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)${status === "removed" ? ";opacity:0.85" : ""}"></div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  });
}

function zoneLabelIcon(label: string) {
  const short = label.split(",")[0]?.trim() ?? label;
  return L.divIcon({
    className: "",
    html: `<div style="padding:2px 6px;border-radius:999px;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.35);color:#e2e8f0;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35)">${short}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function FitMarkers({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((point) => point.join(",")).join("|");

  useEffect(() => {
    if (!key) return;
    const latLngs = key.split("|").map((pair) => {
      const [lat, lng] = pair.split(",").map(Number);
      return L.latLng(lat, lng);
    });
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 14 });
  }, [map, key]);

  return null;
}

function InvalidateSize() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 50);
    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

export interface OccupancyMinimapLegendItem {
  status: OccupancyListingChangeStatus;
  label: string;
  count: number;
}

interface OverlayOption {
  id: OccupancyMapOverlayId;
  label: string;
  hint: string;
}

interface Props {
  listings: OccupancyMapListing[];
  legend?: OccupancyMinimapLegendItem[];
  emptyLabel: string;
  statusLabels?: Partial<Record<OccupancyListingChangeStatus, string>>;
  expandable?: boolean;
  expandLabel?: string;
  expandedTitle?: string;
  closeLabel?: string;
  layersTitle?: string;
  zonesLegendTitle?: string;
  overlayOptions?: OverlayOption[];
  listingsCountLabel?: string;
  boundaryAttribution?: string;
}

function zoneShortLabel(zone: string): string {
  return zone.split(",")[0]?.trim() ?? zone;
}

function ZoneLegend({
  title,
  zoneStats,
  activeOverlays,
  priceRange,
  listingsCountLabel,
}: {
  title: string;
  zoneStats: ReturnType<typeof buildZoneOverlayStats>;
  activeOverlays: Set<OccupancyMapOverlayId>;
  priceRange: { min: number; max: number };
  listingsCountLabel: string;
}) {
  const showZones = activeOverlays.has("zones");
  const showDensity = activeOverlays.has("density");
  const showPrice = activeOverlays.has("price");
  if (!showZones && !showDensity && !showPrice) return null;

  const items = zoneStats.filter((zone) => zone.polygons.length > 0);
  if (!items.length) return null;

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-[1000] max-h-[calc(100%-4.5rem)] max-w-[min(100%-5rem,220px)]">
      <div className="pointer-events-auto max-h-[inherit] overflow-y-auto rounded-xl border border-surface-border/80 bg-surface-raised/95 p-2 shadow-lg backdrop-blur-sm">
        <div className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {title}
        </div>
        <ul className="space-y-1">
          {items.map((zone) => {
            const color =
              showPrice && zone.avgPrice != null
                ? priceHeatColor(zone.avgPrice, priceRange.min, priceRange.max)
                : showDensity
                  ? "#6366f1"
                  : zonePaletteColor(zone.zone);
            const fillOpacity =
              showDensity && zone.count > 0
                ? densityFillOpacity(
                    zone.count,
                    Math.max(...items.map((entry) => entry.count), 1),
                  )
                : showPrice && zone.avgPrice != null
                  ? 0.55
                  : 0.45;

            return (
              <li key={zone.zone} className="flex items-start gap-2 text-[11px] leading-tight text-slate-300">
                <span
                  className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/15"
                  style={{ backgroundColor: color, opacity: showDensity ? fillOpacity + 0.35 : 1 }}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-200">{zoneShortLabel(zone.zone)}</span>
                  {showPrice && zone.avgPrice != null ? (
                    <span className="text-[10px] text-slate-400">{fmtMoney(zone.avgPrice)}</span>
                  ) : showDensity && zone.count > 0 ? (
                    <span className="text-[10px] text-slate-400">
                      {zone.count} {listingsCountLabel}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Legend({ legend }: { legend: OccupancyMinimapLegendItem[] }) {
  if (!legend.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      {legend.map((item) => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white/10"
            style={{ backgroundColor: STATUS_COLORS[item.status] }}
          />
          {item.label} ({item.count})
        </span>
      ))}
    </div>
  );
}

function toPositions(poly: GeoPolygon): [number, number][] {
  return poly.map((point) => [point.lat, point.lng]);
}

function ZonePolygons({
  zone,
  polygons,
  pathOptions,
  tooltip,
}: {
  zone: string;
  polygons: GeoPolygon[];
  pathOptions: L.PathOptions;
  tooltip?: ReactNode;
}) {
  if (!polygons.length) return null;

  return (
    <>
      {polygons.map((poly, index) => (
        <Polygon
          key={`${zone}-${index}`}
          positions={toPositions(poly)}
          pathOptions={pathOptions}
        >
          {tooltip ? (
            <Tooltip direction="top" opacity={0.95}>
              {tooltip}
            </Tooltip>
          ) : null}
        </Polygon>
      ))}
    </>
  );
}

function MapOverlays({
  activeOverlays,
  zoneStats,
  priceRange,
  listingsCountLabel,
}: {
  activeOverlays: Set<OccupancyMapOverlayId>;
  zoneStats: ReturnType<typeof buildZoneOverlayStats>;
  priceRange: { min: number; max: number };
  listingsCountLabel: string;
}) {
  const showZones = activeOverlays.has("zones");
  const showDensity = activeOverlays.has("density");
  const showPrice = activeOverlays.has("price");
  const maxCount = Math.max(...zoneStats.map((zone) => zone.count), 1);

  return (
    <>
      {showZones
        ? zoneStats.map((zone) => {
            const color = zonePaletteColor(zone.zone);
            return (
            <ZonePolygons
              key={`zone-${zone.zone}`}
              zone={zone.zone}
              polygons={zone.polygons}
              pathOptions={{
                color,
                weight: 1.5,
                opacity: 0.9,
                fillColor: color,
                fillOpacity: 0.18,
              }}
              tooltip={<span className="text-xs font-medium text-slate-800">{zone.zone}</span>}
            />
            );
          })
        : null}

      {showDensity
        ? zoneStats
            .filter((zone) => zone.count > 0 && zone.polygons.length > 0)
            .map((zone) => (
              <ZonePolygons
                key={`density-${zone.zone}`}
                zone={zone.zone}
                polygons={zone.polygons}
                pathOptions={{
                  color: "#818cf8",
                  weight: 1,
                  opacity: 0.65,
                  fillColor: "#6366f1",
                  fillOpacity: densityFillOpacity(zone.count, maxCount),
                }}
                tooltip={
                  <div className="text-xs text-slate-800">
                    <p className="font-medium">{zone.zone}</p>
                    <p className="mt-0.5">
                      {zone.count} {listingsCountLabel}
                    </p>
                  </div>
                }
              />
            ))
        : null}

      {showPrice
        ? zoneStats
            .filter((zone) => zone.avgPrice != null && zone.polygons.length > 0)
            .map((zone) => {
              const color = priceHeatColor(zone.avgPrice!, priceRange.min, priceRange.max);
              return (
                <ZonePolygons
                  key={`price-${zone.zone}`}
                  zone={zone.zone}
                  polygons={zone.polygons}
                  pathOptions={{
                    color,
                    weight: 1.5,
                    opacity: 0.9,
                    fillColor: color,
                    fillOpacity: 0.3,
                  }}
                  tooltip={
                    <div className="text-xs text-slate-800">
                      <p className="font-medium">{zone.zone}</p>
                      <p className="mt-0.5 font-semibold">{fmtMoney(zone.avgPrice!)}</p>
                      <p className="text-slate-600">
                        {zone.count} {listingsCountLabel}
                      </p>
                    </div>
                  }
                />
              );
            })
        : null}

      {showZones
        ? zoneStats
            .filter((zone) => zone.polygons.length > 0)
            .map((zone) => (
              <Marker
                key={`label-${zone.zone}`}
                position={[zone.lat, zone.lng]}
                icon={zoneLabelIcon(zone.zone)}
                interactive={false}
                zIndexOffset={-100}
              />
            ))
        : null}
    </>
  );
}

function MapCanvas({
  listings,
  points,
  statusLabels,
  heightClass,
  scrollWheelZoom,
  invalidateSize,
  activeOverlays,
  zoneStats,
  priceRange,
  overlayOptions,
  onToggleOverlay,
  layersTitle,
  zonesLegendTitle = "Zones",
  listingsCountLabel,
  boundaryAttribution,
}: {
  listings: OccupancyMapListing[];
  points: [number, number][];
  statusLabels: Partial<Record<OccupancyListingChangeStatus, string>>;
  heightClass: string;
  scrollWheelZoom: boolean;
  invalidateSize?: boolean;
  activeOverlays: Set<OccupancyMapOverlayId>;
  zoneStats: ReturnType<typeof buildZoneOverlayStats>;
  priceRange: { min: number; max: number };
  overlayOptions: OverlayOption[];
  onToggleOverlay: (id: OccupancyMapOverlayId) => void;
  layersTitle: string;
  zonesLegendTitle: string;
  listingsCountLabel: string;
  boundaryAttribution?: string;
}) {
  const tile = activeOverlays.has("darkMap") ? MAP_TILES.dark : MAP_TILES.light;
  const showBoundaryCredit =
    boundaryAttribution &&
    (activeOverlays.has("zones") ||
      activeOverlays.has("density") ||
      activeOverlays.has("price"));

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-surface-border/60",
        heightClass,
      )}
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        className="h-full w-full"
        scrollWheelZoom={scrollWheelZoom}
      >
        <TileLayer attribution={tile.attribution} url={tile.url} />
        {invalidateSize ? <InvalidateSize /> : null}
        {points.length > 0 ? <FitMarkers points={points} /> : null}
        <MapOverlays
          activeOverlays={activeOverlays}
          zoneStats={zoneStats}
          priceRange={priceRange}
          listingsCountLabel={listingsCountLabel}
        />
        {listings.map((listing) => {
          const status = listing.change_status ?? "still_active";
          return (
            <Marker
              key={`${listing.id}-${status}`}
              position={[listing.lat, listing.lng]}
              icon={markerIcon(status)}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-medium text-slate-800">{listing.zone ?? "—"}</p>
                  {listing.address ? (
                    <p className="mt-0.5 text-xs text-slate-600">{listing.address}</p>
                  ) : null}
                  {statusLabels[status] ? (
                    <p className="mt-1 text-xs font-medium" style={{ color: STATUS_COLORS[status] }}>
                      {statusLabels[status]}
                    </p>
                  ) : null}
                  <p className="mt-1 font-medium text-slate-900">{fmtMoney(listing.price)}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <ZoneLegend
        title={zonesLegendTitle}
        zoneStats={zoneStats}
        activeOverlays={activeOverlays}
        priceRange={priceRange}
        listingsCountLabel={listingsCountLabel}
      />

      {overlayOptions.length > 0 ? (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] max-w-[calc(100%-4.5rem)]">
          <div className="pointer-events-auto">
          <div className="rounded-xl border border-surface-border/80 bg-surface-raised/95 p-2 shadow-lg backdrop-blur-sm">
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              <Layers size={12} />
              <span>{layersTitle}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {overlayOptions.map((option) => {
                const active = activeOverlays.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    title={option.hint}
                    onClick={() => onToggleOverlay(option.id)}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors",
                      active
                        ? "border-accent/60 bg-accent/20 text-white"
                        : "border-surface-border/60 bg-surface/40 text-slate-400 hover:text-slate-200",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      ) : null}

      {showBoundaryCredit ? (
        <p className="pointer-events-none absolute bottom-1 right-2 z-[1000] max-w-[55%] text-right text-[9px] leading-tight text-slate-500/90">
          {boundaryAttribution}
        </p>
      ) : null}
    </div>
  );
}

export default function OccupancyMinimap({
  listings,
  legend = [],
  emptyLabel,
  statusLabels = {},
  expandable = false,
  expandLabel = "Expand map",
  expandedTitle = "Map",
  closeLabel = "Close",
  layersTitle = "Layers",
  zonesLegendTitle = "Zones",
  overlayOptions = [],
  listingsCountLabel = "listings",
  boundaryAttribution,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState<Set<OccupancyMapOverlayId>>(
    () => new Set(["zones"]),
  );

  const points = useMemo(
    () => listings.map((listing) => [listing.lat, listing.lng] as [number, number]),
    [listings],
  );

  const zoneStats = useMemo(() => buildZoneOverlayStats(listings), [listings]);

  const priceRange = useMemo(() => {
    const prices = zoneStats
      .map((zone) => zone.avgPrice)
      .filter((value): value is number => value != null && value > 0);
    if (!prices.length) return { min: 0, max: 0 };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [zoneStats]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const toggleOverlay = (id: OccupancyMapOverlayId) => {
    setActiveOverlays((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!listings.length) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-surface-border/60 bg-surface-raised/20 text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const mapContent = (heightClass: string, scrollWheelZoom: boolean, invalidateSize = false) => (
    <MapCanvas
      listings={listings}
      points={points}
      statusLabels={statusLabels}
      heightClass={heightClass}
      scrollWheelZoom={scrollWheelZoom}
      invalidateSize={invalidateSize}
      activeOverlays={activeOverlays}
      zoneStats={zoneStats}
      priceRange={priceRange}
      overlayOptions={overlayOptions}
      onToggleOverlay={toggleOverlay}
      layersTitle={layersTitle}
      zonesLegendTitle={zonesLegendTitle}
      listingsCountLabel={listingsCountLabel}
      boundaryAttribution={boundaryAttribution}
    />
  );

  return (
    <div className="space-y-2">
      <Legend legend={legend} />
      <div className="relative">
        {mapContent("h-52 sm:h-56", false)}
        {expandable ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute right-2 top-2 z-[1000] inline-flex items-center gap-1.5 rounded-lg border border-surface-border/80 bg-surface-raised/95 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-lg backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-white"
            aria-label={expandLabel}
          >
            <Maximize2 size={14} />
            <span className="hidden sm:inline">{expandLabel}</span>
          </button>
        ) : null}
      </div>

      {expanded && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              onClick={() => setExpanded(false)}
              role="dialog"
              aria-modal="true"
              aria-label={expandedTitle}
            >
              <div
                className="card-glass flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-surface-border/80 px-5 py-4">
                  <h3 className="text-base font-semibold text-white">{expandedTitle}</h3>
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-raised hover:text-slate-200"
                    aria-label={closeLabel}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-3 overflow-y-auto p-5">
                  <Legend legend={legend} />
                  {mapContent("h-[min(70vh,640px)]", true, true)}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
