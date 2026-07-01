"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { CityListingsCache, MapListing } from "@/lib/types";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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
}

export default function ListingsMapView({ data, selectedId, onSelect }: Props) {
  const center: [number, number] = [data.center.lat, data.center.lng];
  const mappable = data.listings.filter((l) => l.lat !== 0 || l.lng !== 0);

  return (
    <MapContainer center={center} zoom={12} className="h-full w-full rounded-lg" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyTo center={center} zoom={12} />
      {mappable.map((listing) => (
        <Marker
          key={listing.id}
          position={[listing.lat, listing.lng]}
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
  );
}
