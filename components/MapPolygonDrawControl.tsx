"use client";

import { useCallback, useEffect, useRef } from "react";
import { Polygon, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw/dist/leaflet.draw.css";
import type { GeoPolygon } from "@/lib/geo-filter";
import { isValidPolygon } from "@/lib/geo-filter";

const POLYGON_DRAW_OPTIONS = {
  allowIntersection: false,
  showArea: true,
  shapeOptions: {
    color: "#10b981",
    weight: 2,
    fillOpacity: 0.12,
  },
};

function extractPolygonPoints(layer: L.Layer): GeoPolygon | null {
  if (!(layer instanceof L.Polygon)) return null;
  const latlngs = layer.getLatLngs();
  const ring = (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs) as L.LatLng[];
  const points = ring.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
  return points.length >= 3 ? points : null;
}

function PolygonDrawControl({
  polygon,
  onPolygonChange,
  onStartDrawReady,
}: {
  polygon: GeoPolygon | null;
  onPolygonChange: (points: GeoPolygon | null) => void;
  onStartDrawReady?: (startDraw: () => void) => void;
}) {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  const onChangeRef = useRef(onPolygonChange);
  const skipSyncRef = useRef(false);
  onChangeRef.current = onPolygonChange;

  const startDraw = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("leaflet-draw");
    drawHandlerRef.current?.disable();
    drawHandlerRef.current = new L.Draw.Polygon(
      map as L.DrawMap,
      POLYGON_DRAW_OPTIONS,
    );
    drawHandlerRef.current.enable();
  }, [map]);

  useEffect(() => {
    onStartDrawReady?.(startDraw);
  }, [onStartDrawReady, startDraw]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("leaflet-draw");

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        rectangle: false,
        polygon: POLYGON_DRAW_OPTIONS,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });

    map.addControl(drawControl);

    const syncFromLayers = () => {
      let found: GeoPolygon | null = null;
      drawnItems.eachLayer((layer) => {
        found = extractPolygonPoints(layer);
      });
      onChangeRef.current(found);
    };

    const onCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);
      skipSyncRef.current = true;
      onChangeRef.current(extractPolygonPoints(event.layer));
    };

    const onEdited = () => {
      skipSyncRef.current = true;
      syncFromLayers();
    };

    const onDeleted = () => {
      skipSyncRef.current = true;
      onChangeRef.current(null);
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.EDITED, onEdited);
    map.on(L.Draw.Event.DELETED, onDeleted);

    return () => {
      drawHandlerRef.current?.disable();
      drawHandlerRef.current = null;
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off(L.Draw.Event.EDITED, onEdited);
      map.off(L.Draw.Event.DELETED, onDeleted);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
      drawnItemsRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    if (!drawnItems) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    drawnItems.clearLayers();
    if (isValidPolygon(polygon)) {
      const latlngs = polygon.map((p) => L.latLng(p.lat, p.lng));
      const layer = L.polygon(latlngs, POLYGON_DRAW_OPTIONS.shapeOptions);
      drawnItems.addLayer(layer);
    }
  }, [polygon]);

  return null;
}

export function MapPolygonLayer({
  active,
  polygon,
  onPolygonChange,
  onStartDrawReady,
}: {
  active: boolean;
  polygon: GeoPolygon | null;
  onPolygonChange: (points: GeoPolygon | null) => void;
  onStartDrawReady?: (startDraw: () => void) => void;
}) {
  if (active) {
    return (
      <PolygonDrawControl
        polygon={polygon}
        onPolygonChange={onPolygonChange}
        onStartDrawReady={onStartDrawReady}
      />
    );
  }

  if (!isValidPolygon(polygon)) return null;

  const positions = polygon.map((p) => [p.lat, p.lng] as [number, number]);
  return (
    <Polygon
      positions={positions}
      pathOptions={{ color: "#10b981", weight: 2, fillOpacity: 0.12, dashArray: "6 4" }}
    />
  );
}
