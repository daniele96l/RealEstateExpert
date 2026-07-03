"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { formatDistance } from "@/lib/geo-filter";
import type { GeoBounds } from "@/lib/geo-filter";
import type { MapCenter, MapListing } from "@/lib/types";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const previewIcon = L.divIcon({
  className: "",
  html: `<div style="width:8px;height:8px;border-radius:50%;background:#94a3b8;border:1px solid #fff;opacity:0.8"></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

interface Props {
  center: MapCenter;
  mode: "radius" | "rectangle";
  radiusM?: number | null;
  bounds: GeoBounds | null;
  onBoundsChange: (bounds: GeoBounds | null) => void;
  onCenterChange?: (center: MapCenter) => void;
  previewListings?: MapListing[];
}

function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [map, center[0], center[1], zoom]);
  return null;
}

function DrawControl({ onBoundsChange }: { onBoundsChange: (bounds: GeoBounds | null) => void }) {
  const map = useMap();
  const drawnRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("leaflet-draw");

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      draw: {
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        polygon: false,
        rectangle: {
          shapeOptions: {
            color: "#10b981",
            weight: 2,
          },
        },
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });

    map.addControl(drawControl);

    const onCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      drawnItems.clearLayers();
      drawnRef.current = event.layer;
      drawnItems.addLayer(event.layer);

      if (event.layer instanceof L.Rectangle) {
        const latLngBounds = event.layer.getBounds();
        onBoundsChange({
          south: latLngBounds.getSouth(),
          west: latLngBounds.getWest(),
          north: latLngBounds.getNorth(),
          east: latLngBounds.getEast(),
        });
      }
    };

    const onEdited = () => {
      drawnItems.eachLayer((layer) => {
        if (layer instanceof L.Rectangle) {
          const latLngBounds = layer.getBounds();
          onBoundsChange({
            south: latLngBounds.getSouth(),
            west: latLngBounds.getWest(),
            north: latLngBounds.getNorth(),
            east: latLngBounds.getEast(),
          });
        }
      });
    };

    const onDeleted = () => {
      onBoundsChange(null);
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.EDITED, onEdited);
    map.on(L.Draw.Event.DELETED, onDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off(L.Draw.Event.EDITED, onEdited);
      map.off(L.Draw.Event.DELETED, onDeleted);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onBoundsChange]);

  return null;
}

function CenterClickHandler({
  onCenterChange,
  displayName,
}: {
  onCenterChange?: (center: MapCenter) => void;
  displayName: string | null;
}) {
  useMapEvents({
    click(e) {
      onCenterChange?.({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        display_name: displayName,
      });
    },
  });
  return null;
}

export default function AreaSelectMap({
  center,
  mode,
  radiusM,
  bounds,
  onBoundsChange,
  onCenterChange,
  previewListings = [],
}: Props) {
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    setMapReady(true);
    return () => setMapReady(false);
  }, []);

  const mapCenter: [number, number] = [center.lat, center.lng];
  const mappable = previewListings.filter((l) => l.lat !== 0 || l.lng !== 0);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {mode === "rectangle"
          ? "Usa lo strumento rettangolo in alto a destra sulla mappa per definire l'area."
          : radiusM != null && radiusM > 0
            ? `Cerchio di ${formatDistance(radiusM)} dal centro. Clicca sulla mappa per spostare il centro.`
            : "Intera città — clicca sulla mappa per impostare un centro personalizzato."}
      </p>
      <div className="h-[260px] overflow-hidden rounded-lg border border-surface-border">
        {!mapReady ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Caricamento mappa…
          </div>
        ) : (
        <MapContainer
          key={mode}
          center={mapCenter}
          zoom={13}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyTo center={mapCenter} zoom={13} />
          {mode === "radius" && (
            <>
              <CenterClickHandler onCenterChange={onCenterChange} displayName={center.display_name} />
              <Marker position={mapCenter} />
              {radiusM != null && radiusM > 0 && (
                <Circle
                  center={mapCenter}
                  radius={radiusM}
                  pathOptions={{ color: "#10b981", weight: 2, fillOpacity: 0.12 }}
                />
              )}
            </>
          )}
          {mode === "rectangle" && <DrawControl onBoundsChange={onBoundsChange} />}
          {mode === "rectangle" && bounds && (
            <Rectangle
              bounds={[
                [bounds.south, bounds.west],
                [bounds.north, bounds.east],
              ]}
              pathOptions={{ color: "#10b981", weight: 2, fillOpacity: 0.12 }}
            />
          )}
          {mappable.map((listing) => (
            <Marker
              key={`${listing.operation}-${listing.id}`}
              position={[listing.lat, listing.lng]}
              icon={previewIcon}
            />
          ))}
        </MapContainer>
        )}
      </div>
    </div>
  );
}
