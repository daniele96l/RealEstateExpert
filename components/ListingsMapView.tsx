"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { GeoBounds, GeoPoint, GeoPolygon } from "@/lib/geo-filter";
import { formatDistance, isValidPolygon } from "@/lib/geo-filter";
import { MapPolygonLayer } from "@/components/MapPolygonDrawControl";
import type { SavedMapPolygon } from "@/lib/map-polygon-filters";
import { ListingMapPreview } from "@/components/ListingMapPreview";
import type { ListingProfitPreview } from "@/lib/listing-profit-preview";
import type { ProfitGradientRange } from "@/lib/profit-gradient";
import { readLocalPropertyDetailCache } from "@/lib/property-detail-cache-client";
import type { CityListingsCache, MapListing } from "@/lib/types";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

function listingKey(listing: MapListing): string {
  return `${listing.operation}-${listing.id}`;
}

function createMarkerIcon(operation: "sale" | "rent", highlighted: boolean) {
  const color = operation === "sale" ? "#10b981" : "#3b82f6";
  const size = highlighted ? 18 : 12;
  const anchor = size / 2;
  const shadow = highlighted
    ? `0 0 0 3px ${color}55, 0 0 14px ${color}aa`
    : "0 1px 4px rgba(0,0,0,0.4)";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:${shadow}"></div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  });
}

const MARKER_ICONS = {
  sale: createMarkerIcon("sale", false),
  saleHi: createMarkerIcon("sale", true),
  rent: createMarkerIcon("rent", false),
  rentHi: createMarkerIcon("rent", true),
};

function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [map, center[0], center[1], zoom]);
  return null;
}

function SafeTileLayer({
  attribution,
  url,
}: {
  attribution: string;
  url: string;
}) {
  const map = useMap();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setReady(true);
    };
    if (map.getSize().x > 0 && map.getSize().y > 0) {
      markReady();
      return;
    }
    map.whenReady(markReady);
    return () => {
      cancelled = true;
      setReady(false);
    };
  }, [map]);

  if (!ready) return null;

  return <TileLayer attribution={attribution} url={url} />;
}

function MapInvalidateOnResize() {
  const map = useMap();

  useEffect(() => {
    const onResize = () => {
      const size = map.getSize();
      if (size.x > 0 && size.y > 0) map.invalidateSize();
    };
    onResize();
    map.on("resize", onResize);
    window.addEventListener("resize", onResize);
    return () => {
      map.off("resize", onResize);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);

  return null;
}

function MapBoundsReporter({ onBoundsChange }: { onBoundsChange: (bounds: GeoBounds) => void }) {
  const map = useMap();

  const report = useCallback(() => {
    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return;

    const bounds = map.getBounds();
    onBoundsChange({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });
  }, [map, onBoundsChange]);

  useEffect(() => {
    map.invalidateSize();
    report();
  }, [map, report]);

  useMapEvents({
    moveend: report,
    zoomend: report,
    resize: report,
  });

  return null;
}

function AreaFilterLayer({
  center,
  radiusM,
  onCenterChange,
}: {
  center: GeoPoint;
  radiusM: number;
  onCenterChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      const target = e.originalEvent.target as HTMLElement;
      if (target.closest(".leaflet-marker-pane") || target.closest(".leaflet-popup")) return;
      onCenterChange(e.latlng.lat, e.latlng.lng);
    },
  });

  const position: [number, number] = [center.lat, center.lng];

  return (
    <>
      <Marker
        position={position}
        icon={L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })}
        zIndexOffset={2000}
      />
      <Circle
        center={position}
        radius={radiusM}
        pathOptions={{ color: "#10b981", weight: 2, fillOpacity: 0.1, dashArray: "6 4" }}
      />
    </>
  );
}

const ListingPopup = memo(function ListingPopup({
  listing,
  profit,
  profitRange,
  onOpen,
}: {
  listing: MapListing;
  profit?: ListingProfitPreview | null;
  profitRange?: ProfitGradientRange;
  onOpen: () => void;
}) {
  const imageUrl = readLocalPropertyDetailCache(listing.id)?.images?.[0] ?? null;

  return (
    <div className="space-y-2">
      <ListingMapPreview
        listing={listing}
        imageUrl={imageUrl}
        profit={profit}
        profitRange={profitRange}
      />
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800"
      >
        Apri scheda
      </button>
    </div>
  );
});

const ListingMarker = memo(function ListingMarker({
  listing,
  highlighted,
  dimmed,
  profit,
  profitRange,
  onOpen,
}: {
  listing: MapListing;
  highlighted: boolean;
  dimmed: boolean;
  profit?: ListingProfitPreview | null;
  profitRange?: ProfitGradientRange;
  onOpen: () => void;
}) {
  const icon =
    listing.operation === "sale"
      ? highlighted
        ? MARKER_ICONS.saleHi
        : MARKER_ICONS.sale
      : highlighted
        ? MARKER_ICONS.rentHi
        : MARKER_ICONS.rent;

  return (
    <Marker
      position={[listing.lat, listing.lng]}
      icon={icon}
      opacity={dimmed ? 0.45 : 1}
      zIndexOffset={highlighted ? 1000 : 0}
    >
      <Popup minWidth={240} maxWidth={260} className="listing-map-popup">
        <ListingPopup
          listing={listing}
          profit={profit}
          profitRange={profitRange}
          onOpen={onOpen}
        />
      </Popup>
    </Marker>
  );
});

interface Props {
  data: CityListingsCache;
  selectedId: string | null;
  hoveredListingKey?: string | null;
  onSelect: (listing: MapListing) => void;
  combinedListings?: MapListing[];
  areaRadiusM?: number | null;
  filterAreaCenter?: GeoPoint | null;
  filterAreaRadiusM?: number | null;
  onFilterAreaCenterChange?: (lat: number, lng: number) => void;
  viewportListings?: MapListing[];
  onViewportBoundsChange?: (bounds: GeoBounds) => void;
  profitPreviews?: Map<string, ListingProfitPreview>;
  profitRange?: ProfitGradientRange;
  polygonFilter?: GeoPolygon | null;
  polygonDrawActive?: boolean;
  onPolygonChange?: (points: GeoPolygon | null) => void;
  savedPolygons?: SavedMapPolygon[];
  onSavePolygon?: (name: string) => void;
  onLoadSavedPolygon?: (id: string) => void;
  onDeleteSavedPolygon?: (id: string) => void;
}

export default function ListingsMapView({
  data,
  selectedId,
  hoveredListingKey = null,
  onSelect,
  combinedListings,
  areaRadiusM,
  filterAreaCenter,
  filterAreaRadiusM,
  onFilterAreaCenterChange,
  viewportListings,
  onViewportBoundsChange,
  profitPreviews,
  profitRange,
  polygonFilter,
  polygonDrawActive = false,
  onPolygonChange,
  savedPolygons = [],
  onSavePolygon,
  onLoadSavedPolygon,
  onDeleteSavedPolygon,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canMountMap, setCanMountMap] = useState(false);
  const [mapMountKey, setMapMountKey] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let hadSize = false;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const hasSize = width > 0 && height > 0;
      if (hasSize && !hadSize) {
        setMapMountKey((k) => k + 1);
        setCanMountMap(true);
      } else if (!hasSize && hadSize) {
        setCanMountMap(false);
      }
      hadSize = hasSize;
    };

    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  const center: [number, number] = [data.center.lat, data.center.lng];
  const mapKey = `${data.city}-${data.operation}-${data.center.lat}-${data.center.lng}-${mapMountKey}`;
  const mappable = useMemo(() => {
    const source =
      viewportListings && viewportListings.length > 0
        ? viewportListings
        : combinedListings ?? data.listings;
    return source.filter((l) => l.lat !== 0 || l.lng !== 0);
  }, [viewportListings, combinedListings, data.listings]);

  const counts = useMemo(() => {
    const sale = mappable.filter((l) => l.operation === "sale").length;
    const rent = mappable.filter((l) => l.operation === "rent").length;
    return { sale, rent };
  }, [mappable]);

  const showLegend = combinedListings != null && (counts.sale > 0 || counts.rent > 0);
  const dimOthers = Boolean(hoveredListingKey || selectedId);
  const startPolygonDrawRef = useRef<(() => void) | null>(null);

  const handleStartDrawReady = useCallback((startDraw: () => void) => {
    startPolygonDrawRef.current = startDraw;
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {!canMountMap ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
          Caricamento mappa…
        </div>
      ) : (
      <MapContainer key={mapKey} center={center} zoom={12} className="h-full w-full rounded-lg" scrollWheelZoom>
        <SafeTileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapInvalidateOnResize />
        <FlyTo center={center} zoom={12} />
        {onViewportBoundsChange && <MapBoundsReporter onBoundsChange={onViewportBoundsChange} />}
        {areaRadiusM != null && areaRadiusM > 0 && (
          <Circle
            center={center}
            radius={areaRadiusM}
            pathOptions={{ color: "#6366f1", weight: 1, fillOpacity: 0.04, dashArray: "4 4" }}
          />
        )}
        {filterAreaCenter && filterAreaRadiusM != null && filterAreaRadiusM > 0 && onFilterAreaCenterChange && (
          <AreaFilterLayer
            center={filterAreaCenter}
            radiusM={filterAreaRadiusM}
            onCenterChange={onFilterAreaCenterChange}
          />
        )}
        {onPolygonChange && (
          <MapPolygonLayer
            active={polygonDrawActive}
            polygon={polygonFilter ?? null}
            onPolygonChange={onPolygonChange}
            onStartDrawReady={polygonDrawActive ? handleStartDrawReady : undefined}
          />
        )}
        {mappable.map((listing) => {
          const key = listingKey(listing);
          const highlighted = hoveredListingKey === key || selectedId === listing.id;
          return (
            <ListingMarker
              key={key}
              listing={listing}
              highlighted={highlighted}
              dimmed={dimOthers && !highlighted}
              profit={profitPreviews?.get(listing.id) ?? null}
              profitRange={profitRange}
              onOpen={() => onSelect(listing)}
            />
          );
        })}
      </MapContainer>
      )}
      {canMountMap && showLegend && (
        <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-surface-border bg-white px-3 py-2 text-xs text-neutral-700 ">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Vendita ({counts.sale})
          </span>
          <span className="mx-2 text-neutral-500">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
            Affitto ({counts.rent})
          </span>
        </div>
      )}
      {canMountMap && filterAreaCenter && filterAreaRadiusM != null && filterAreaRadiusM > 0 && (
        <div className="absolute bottom-3 right-3 z-[1000] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-700 ">
          Filtro zona · {formatDistance(filterAreaRadiusM)}
        </div>
      )}
      {canMountMap && polygonDrawActive && isValidPolygon(polygonFilter) && (
        <div className="absolute bottom-3 right-3 z-[1000] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-700 ">
          Filtro poligono attivo
        </div>
      )}
      {canMountMap && polygonDrawActive && onPolygonChange && (
        <MapPolygonToolbar
          polygon={polygonFilter ?? null}
          savedPolygons={savedPolygons}
          onStartDraw={() => startPolygonDrawRef.current?.()}
          onSavePolygon={onSavePolygon}
          onLoadSavedPolygon={onLoadSavedPolygon}
          onDeleteSavedPolygon={onDeleteSavedPolygon}
          onClearPolygon={() => onPolygonChange(null)}
        />
      )}
    </div>
  );
}

function MapPolygonToolbar({
  polygon,
  savedPolygons,
  onStartDraw,
  onSavePolygon,
  onLoadSavedPolygon,
  onDeleteSavedPolygon,
  onClearPolygon,
}: {
  polygon: GeoPolygon | null;
  savedPolygons: SavedMapPolygon[];
  onStartDraw: () => void;
  onSavePolygon?: (name: string) => void;
  onLoadSavedPolygon?: (id: string) => void;
  onDeleteSavedPolygon?: (id: string) => void;
  onClearPolygon: () => void;
}) {
  const canSave = isValidPolygon(polygon) && onSavePolygon;

  return (
    <div className="absolute left-3 top-3 z-[1000] w-56 space-y-2 rounded-lg border border-neutral-300 bg-white p-3 text-xs text-neutral-700 shadow-lg ">
      <p className="font-medium text-neutral-800">Area disegnata</p>
      <button
        type="button"
        onClick={onStartDraw}
        className="w-full rounded-md border border-neutral-300 bg-neutral-100 px-2 py-2 text-xs font-medium text-neutral-900 hover:hover:bg-neutral-200"
      >
        Disegna poligono
      </button>
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Clicca sulla mappa per ogni vertice, poi chiudi il poligono. Usa anche lo
        strumento in alto a destra sulla mappa.
      </p>
      {canSave && (
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Nome area salvata", "La mia zona");
            if (name != null && name.trim()) onSavePolygon(name.trim());
          }}
          className="w-full rounded-md border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-xs font-medium text-neutral-900 hover:hover:bg-neutral-200"
        >
          Salva poligono
        </button>
      )}
      {isValidPolygon(polygon) && (
        <button
          type="button"
          onClick={onClearPolygon}
          className="w-full rounded-md border border-surface-border px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
        >
          Cancella area
        </button>
      )}
      {savedPolygons.length > 0 && onLoadSavedPolygon && (
        <div className="space-y-1 border-t border-surface-border/60 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Salvate</p>
          {savedPolygons.map((saved) => (
            <div key={saved.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onLoadSavedPolygon(saved.id)}
                className="min-w-0 flex-1 truncate rounded-md border border-surface-border px-2 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-100"
                title={saved.name}
              >
                {saved.name}
              </button>
              {onDeleteSavedPolygon && (
                <button
                  type="button"
                  onClick={() => onDeleteSavedPolygon(saved.id)}
                  className="shrink-0 rounded-md border border-surface-border px-1.5 py-1 text-neutral-500 hover:text-red-400"
                  aria-label={`Elimina ${saved.name}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { listingKey };
