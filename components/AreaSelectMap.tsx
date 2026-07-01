"use client";

import { useEffect, useRef } from "react";
import { MapContainer, Rectangle, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import type { GeoBounds } from "@/lib/geo-filter";
import type { MapCenter } from "@/lib/types";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface Props {
  center: MapCenter;
  bounds: GeoBounds | null;
  onBoundsChange: (bounds: GeoBounds | null) => void;
}

function DrawControl({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: GeoBounds | null) => void;
}) {
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

export default function AreaSelectMap({ center, bounds, onBoundsChange }: Props) {
  const mapCenter: [number, number] = [center.lat, center.lng];

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Usa lo strumento rettangolo sulla mappa per definire l&apos;area di interesse.
      </p>
      <div className="h-[200px] overflow-hidden rounded-lg border border-surface-border">
        <MapContainer center={mapCenter} zoom={13} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <DrawControl onBoundsChange={onBoundsChange} />
          {bounds && (
            <Rectangle
              bounds={[
                [bounds.south, bounds.west],
                [bounds.north, bounds.east],
              ]}
              pathOptions={{ color: "#10b981", weight: 2, fillOpacity: 0.1 }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
