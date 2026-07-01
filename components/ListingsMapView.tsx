"use client";

import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { CityListingsCache, MapListing } from "@/lib/types";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

const saleIcon = L.divIcon({
  className: "",
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#10b981;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const rentIcon = L.divIcon({
  className: "",
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [map, center[0], center[1], zoom]);
  return null;
}

function formatPrice(price: number, operation: "sale" | "rent") {
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
  return operation === "rent" ? `${formatted}/mese` : formatted;
}

interface Props {
  data: CityListingsCache;
  selectedId: string | null;
  onSelect: (listing: MapListing) => void;
  combinedListings?: MapListing[];
  areaRadiusM?: number | null;
}

export default function ListingsMapView({
  data,
  selectedId,
  onSelect,
  combinedListings,
  areaRadiusM,
}: Props) {
  const center: [number, number] = [data.center.lat, data.center.lng];
  const listings = combinedListings ?? data.listings;
  const mappable = listings.filter((l) => l.lat !== 0 || l.lng !== 0);

  const counts = useMemo(() => {
    const sale = mappable.filter((l) => l.operation === "sale").length;
    const rent = mappable.filter((l) => l.operation === "rent").length;
    return { sale, rent };
  }, [mappable]);

  const showLegend = combinedListings != null && (counts.sale > 0 || counts.rent > 0);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={12} className="h-full w-full rounded-lg" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyTo center={center} zoom={12} />
        {areaRadiusM != null && areaRadiusM > 0 && (
          <Circle
            center={center}
            radius={areaRadiusM}
            pathOptions={{ color: "#10b981", weight: 1, fillOpacity: 0.05, dashArray: "4 4" }}
          />
        )}
        {mappable.map((listing) => (
          <Marker
            key={`${listing.operation}-${listing.id}`}
            position={[listing.lat, listing.lng]}
            icon={listing.operation === "sale" ? saleIcon : rentIcon}
            eventHandlers={{ click: () => onSelect(listing) }}
            opacity={selectedId && selectedId !== listing.id ? 0.6 : 1}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-medium">{listing.title}</p>
                <p>{formatPrice(listing.price, listing.operation)}</p>
                {listing.sqm != null && <p>{listing.sqm} m²</p>}
                <button
                  type="button"
                  className="mt-2 text-blue-600 underline"
                  onClick={() => onSelect(listing)}
                >
                  Usa per analisi
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {showLegend && (
        <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-surface-border/80 bg-surface-raised/95 px-3 py-2 text-xs text-slate-300 backdrop-blur-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Vendita ({counts.sale})
          </span>
          <span className="mx-2 text-slate-600">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
            Affitto ({counts.rent})
          </span>
        </div>
      )}
    </div>
  );
}
