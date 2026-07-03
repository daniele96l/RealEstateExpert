"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { ExternalLink } from "lucide-react";
import type { ListingDetail, MapListing } from "@/lib/types";
import type { MarketId } from "@/lib/markets";
import { formatListingsWebsiteSource, inferListingWebsiteSource } from "@/lib/listing-url";
import { listingsUiLabels } from "@/lib/listings-ui-labels";
import { useI18n } from "@/lib/i18n/context";
import { czechRoomLayoutFromListing } from "@/lib/czech-room-layout";
import { fmtMoney } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

function hasCoords(listing: { lat: number; lng: number }): boolean {
  return Number.isFinite(listing.lat) && Number.isFinite(listing.lng) && !(listing.lat === 0 && listing.lng === 0);
}

function saleIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 2px #10b98188,0 2px 8px rgba(0,0,0,0.45)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function rentIcon(highlighted = false) {
  const size = highlighted ? 14 : 11;
  const anchor = size / 2;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  });
}

function formatRent(price: number, market: MarketId, perMonthSuffix: string) {
  return `${fmtMoney(price, market)}${perMonthSuffix}`;
}

function PopupListingLink({
  listing,
  market,
  children,
}: {
  listing: MapListing | ListingDetail;
  market: MarketId;
  children: ReactNode;
}) {
  if (!listing.url) return <>{children}</>;

  const source =
    formatListingsWebsiteSource(inferListingWebsiteSource(listing)) ??
    (market === "cz" ? "Otevřít inzerát" : "Apri annuncio");

  return (
    <a
      href={listing.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block cursor-pointer text-inherit no-underline hover:opacity-95"
    >
      {children}
      <span className="mt-2 inline-flex items-center gap-1 text-xs text-accent group-hover:underline">
        <ExternalLink size={12} />
        {source}
      </span>
    </a>
  );
}

function FitMarkers({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");

  useEffect(() => {
    if (!key) return;
    const latLngs = key.split("|").map((pair) => {
      const [lat, lng] = pair.split(",").map(Number);
      return L.latLng(lat, lng);
    });
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28], maxZoom: 15 });
  }, [map, key]);

  return null;
}

interface Props {
  saleProperty: ListingDetail;
  similarRentals: MapListing[] | null;
  loading?: boolean;
  radiusM?: number | null;
  market?: MarketId;
}

export default function PropertySimilarRentMap({
  saleProperty,
  similarRentals,
  loading = false,
  radiusM = 2_500,
  market = "it",
}: Props) {
  const { t } = useI18n();
  const ui = listingsUiLabels(market, t);
  const saleCoords = hasCoords(saleProperty) ? ([saleProperty.lat, saleProperty.lng] as [number, number]) : null;
  const rentMarkers = useMemo(
    () => (similarRentals ?? []).filter(hasCoords),
    [similarRentals],
  );

  const fitPoints = useMemo(() => {
    const points: [number, number][] = [];
    if (saleCoords) points.push(saleCoords);
    for (const rent of rentMarkers) points.push([rent.lat, rent.lng]);
    return points;
  }, [saleCoords, rentMarkers]);

  const defaultCenter: [number, number] = saleCoords ?? (market === "cz" ? [49.195, 16.608] : [38.111, 15.661]);
  const canShowMap = saleCoords != null || rentMarkers.length > 0;

  if (!canShowMap) {
    return (
      <div className="rounded-xl border border-surface-border/60 bg-surface-raised/30 px-4 py-8 text-center text-sm text-slate-500">
        {market === "cz" ? "Poloha není k dispozici." : "Posizione non disponibile per la mappa."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {market === "cz" ? "Mapa okolí" : "Mappa zona"}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
            {ui.sale}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            {ui.rentsInArea(rentMarkers.length)}
          </span>
        </div>
      </div>
      <div className="relative h-[360px] overflow-hidden rounded-xl border border-surface-border/60">
        <MapContainer center={defaultCenter} zoom={14} className="h-full w-full" scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {fitPoints.length > 0 && <FitMarkers points={fitPoints} />}
          {saleCoords && radiusM != null && radiusM > 0 && (
            <>
              <Circle
                center={saleCoords}
                radius={radiusM}
                pathOptions={{ color: "#10b981", weight: 1, fillOpacity: 0.04, dashArray: "5 5" }}
              />
              <Marker position={saleCoords} icon={saleIcon()} zIndexOffset={2000}>
                <Popup closeOnClick={false}>
                  <PopupListingLink listing={saleProperty} market={market}>
                    <div className="text-sm">
                      <p className="font-medium text-emerald-700">{ui.sale}</p>
                      <p className="line-clamp-2">{saleProperty.title}</p>
                      {saleProperty.sqm != null && (
                        <p className="text-xs text-slate-500">{saleProperty.sqm} m²</p>
                      )}
                      <p>{fmtMoney(saleProperty.price, market)}</p>
                      {saleProperty.sqm != null && saleProperty.sqm > 0 && (
                        <p className="text-xs text-slate-500">
                          {fmtMoney(Math.round(saleProperty.price / saleProperty.sqm), market)}
                          {ui.perSqm}
                        </p>
                      )}
                    </div>
                  </PopupListingLink>
                </Popup>
              </Marker>
            </>
          )}
          {rentMarkers.map((rent) => (
            <Marker
              key={rent.id}
              position={[rent.lat, rent.lng]}
              icon={rentIcon()}
              zIndexOffset={1000}
            >
              <Popup closeOnClick={false}>
                <PopupListingLink listing={rent} market={market}>
                  <div className="text-sm">
                    <p className="font-medium text-blue-700">
                      {market === "cz" ? "Podobný pronájem" : "Affitto simile"}
                    </p>
                    <p className="line-clamp-2">{rent.title}</p>
                    {(rent.sqm != null ||
                      (market === "cz" ? czechRoomLayoutFromListing(rent) : rent.rooms != null)) && (
                      <p className="text-xs text-slate-500">
                        {[
                          market === "cz"
                            ? czechRoomLayoutFromListing(rent)
                            : rent.rooms != null
                              ? ui.rooms(rent.rooms)
                              : null,
                          rent.sqm != null && `${rent.sqm} m²`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <p>{formatRent(rent.price, market, ui.perMonth)}</p>
                    {rent.sqm != null && rent.sqm > 0 && (
                      <p className="text-xs text-slate-500">
                        {fmtMoney(Math.round(rent.price / rent.sqm), market)}
                        {ui.perSqm}
                      </p>
                    )}
                  </div>
                </PopupListingLink>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-black/10 pb-3">
            <span className="rounded-full border border-surface-border/80 bg-surface-raised/95 px-3 py-1 text-xs text-slate-400">
              {market === "cz" ? "Načítání podobných pronájmů…" : "Caricamento affitti simili…"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
