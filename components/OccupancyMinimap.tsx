"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { OccupancyListingChangeStatus, OccupancyMapListing } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

const STATUS_COLORS: Record<OccupancyListingChangeStatus, string> = {
  still_active: "#10b981",
  new: "#38bdf8",
  removed: "#f43f5e",
};

const DEFAULT_CENTER: [number, number] = [38.111, 15.648];

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

export interface OccupancyMinimapLegendItem {
  status: OccupancyListingChangeStatus;
  label: string;
  count: number;
}

interface Props {
  listings: OccupancyMapListing[];
  legend?: OccupancyMinimapLegendItem[];
  emptyLabel: string;
  statusLabels?: Partial<Record<OccupancyListingChangeStatus, string>>;
}

export default function OccupancyMinimap({
  listings,
  legend = [],
  emptyLabel,
  statusLabels = {},
}: Props) {
  const points = useMemo(
    () => listings.map((listing) => [listing.lat, listing.lng] as [number, number]),
    [listings],
  );

  if (!listings.length) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-surface-border/60 bg-surface-raised/20 text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {legend.length > 0 ? (
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
      ) : null}
      <div className="relative h-52 overflow-hidden rounded-xl border border-surface-border/60 sm:h-56">
        <MapContainer center={DEFAULT_CENTER} zoom={12} className="h-full w-full" scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.length > 0 ? <FitMarkers points={points} /> : null}
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
      </div>
    </div>
  );
}
