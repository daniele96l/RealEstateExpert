"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { GeoBounds, GeoPoint } from "@/lib/geo-filter";
import { formatDistance } from "@/lib/geo-filter";
import { ListingMapPreview } from "@/components/ListingMapPreview";
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

function MapBoundsReporter({ onBoundsChange }: { onBoundsChange: (bounds: GeoBounds) => void }) {
  const map = useMap();

  const report = useCallback(() => {
    const bounds = map.getBounds();
    onBoundsChange({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });
  }, [map, onBoundsChange]);

  useEffect(() => {
    report();
  }, [report]);

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
  onOpen,
}: {
  listing: MapListing;
  onOpen: () => void;
}) {
  const imageUrl = readLocalPropertyDetailCache(listing.id)?.images?.[0] ?? null;

  return (
    <div className="space-y-2">
      <ListingMapPreview listing={listing} imageUrl={imageUrl} />
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500"
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
  onOpen,
}: {
  listing: MapListing;
  highlighted: boolean;
  dimmed: boolean;
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
        <ListingPopup listing={listing} onOpen={onOpen} />
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
}: Props) {
  const center: [number, number] = [data.center.lat, data.center.lng];
  const mappable = useMemo(() => {
    const listings = viewportListings ?? combinedListings ?? data.listings;
    return listings.filter((l) => l.lat !== 0 || l.lng !== 0);
  }, [viewportListings, combinedListings, data.listings]);

  const counts = useMemo(() => {
    const sale = mappable.filter((l) => l.operation === "sale").length;
    const rent = mappable.filter((l) => l.operation === "rent").length;
    return { sale, rent };
  }, [mappable]);

  const showLegend = combinedListings != null && (counts.sale > 0 || counts.rent > 0);
  const dimOthers = Boolean(hoveredListingKey || selectedId);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={12} className="h-full w-full rounded-lg" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
        {mappable.map((listing) => {
          const key = listingKey(listing);
          const highlighted = hoveredListingKey === key || selectedId === listing.id;
          return (
            <ListingMarker
              key={key}
              listing={listing}
              highlighted={highlighted}
              dimmed={dimOthers && !highlighted}
              onOpen={() => onSelect(listing)}
            />
          );
        })}
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
      {filterAreaCenter && filterAreaRadiusM != null && filterAreaRadiusM > 0 && (
        <div className="absolute bottom-3 right-3 z-[1000] rounded-lg border border-accent/30 bg-surface-raised/95 px-3 py-2 text-xs text-slate-300 backdrop-blur-sm">
          Filtro zona · {formatDistance(filterAreaRadiusM)}
        </div>
      )}
    </div>
  );
}

export { listingKey };
