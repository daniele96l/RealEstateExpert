"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { getListingsProviders } from "@/lib/api";
import {
  loadCityListingsCacheOnly,
  loadPropertyDetailCacheFirst,
} from "@/lib/cache-first";
import { cacheFileLabel } from "@/lib/listings-cache-client";
import { writeLocalListingsCache } from "@/lib/listings-cache-client";
import type { CityListingsCache, ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import PropertyDetailPanel from "@/components/PropertyDetailPanel";
import BatchFetchPanel from "@/components/BatchFetchPanel";
import ListingsMapFilters from "@/components/ListingsMapFilters";
import { cn } from "@/lib/utils";
import {
  EMPTY_LISTINGS_FILTERS,
  filterListings,
  hasActiveFilters,
  resolveAreaFilterCenter,
  resolveAreaFilterRadius,
  type ListingsFilters,
} from "@/lib/listings-filters";
import { filterListingsByBounds, type GeoBounds } from "@/lib/geo-filter";
import type { SimilarRentEstimateMethod } from "@/lib/rent-price-basis";
import { Layers, MapPin } from "lucide-react";
import type { CombinedListingsData } from "@/lib/types";

const ListingsMapView = dynamic(() => import("./ListingsMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">Caricamento mappa…</div>
  ),
});

function formatPrice(price: number, operation: "sale" | "rent") {
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
  return operation === "rent" ? `${formatted}/mese` : formatted;
}

function listingKey(listing: MapListing): string {
  return `${listing.operation}-${listing.id}`;
}

type ViewMode = "sale" | "rent" | "both";

interface Props {
  onSelectListing?: (listing: MapListing, detail?: ListingDetail) => void;
  onUseSimilarRent?: (saleDetail: ListingDetail, rentListing: MapListing) => void;
  onUseAverageRent?: (
    saleDetail: ListingDetail,
    similarRentals: MapListing[],
    estimateMethod: SimilarRentEstimateMethod,
  ) => void;
  onCityChange?: (city: string) => void;
}

export default function ListingsMap({ onSelectListing, onUseSimilarRent, onUseAverageRent, onCityChange }: Props) {
  const [city, setCity] = useState("Reggio Calabria");
  const [viewMode, setViewMode] = useState<ViewMode>("sale");
  const [provider, setProvider] = useState<ListingsProvider>("rapidapi");
  const [providersAvailable, setProvidersAvailable] = useState({ scrapingbee: false, rapidapi: false });
  const [saleCache, setSaleCache] = useState<CityListingsCache | null>(null);
  const [rentCache, setRentCache] = useState<CityListingsCache | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredListingKey, setHoveredListingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<ListingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailCacheSource, setDetailCacheSource] = useState<"server" | "local" | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [combinedData, setCombinedData] = useState<CombinedListingsData | null>(null);
  const [filters, setFilters] = useState<ListingsFilters>(EMPTY_LISTINGS_FILTERS);
  const [mapBounds, setMapBounds] = useState<GeoBounds | null>(null);

  useEffect(() => {
    getListingsProviders()
      .then((p) => {
        setProvidersAvailable({ scrapingbee: p.scrapingbee, rapidapi: p.rapidapi });
        setProvider(p.default_provider);
      })
      .catch(() => {});
  }, []);

  const loadCachesOnly = useCallback(async () => {
    if (!city.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [saleResult, rentResult] = await Promise.all([
        loadCityListingsCacheOnly(city.trim(), "sale"),
        loadCityListingsCacheOnly(city.trim(), "rent"),
      ]);
      setSaleCache(saleResult.data);
      setRentCache(rentResult.data);
      setCombinedData(null);
      setFromCache(true);
      setFilters(EMPTY_LISTINGS_FILTERS);
      setMapBounds(null);
      setSelectedId(null);
      setHoveredListingKey(null);
      setDetailOpen(false);
      setSelectedDetail(null);

      const displayCity =
        saleResult.data?.center.display_name?.split(",")[0]?.trim() ??
        rentResult.data?.center.display_name?.split(",")[0]?.trim();
      if (displayCity) onCityChange?.(displayCity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [city, onCityChange]);

  useEffect(() => {
    void loadCachesOnly();
  }, [loadCachesOnly]);

  useEffect(() => {
    if (city.trim()) onCityChange?.(city.trim());
  }, [city, onCityChange]);

  const handleSelect = useCallback(
    async (listing: MapListing, preloadedDetail?: ListingDetail) => {
      setSelectedId(listing.id);
      setDetailOpen(true);
      setSelectedDetail(null);
      setDetailError(null);
      setDetailCacheSource(null);
      setDetailLoading(true);
      onSelectListing?.(listing);
      try {
        if (preloadedDetail) {
          setSelectedDetail(preloadedDetail);
          setDetailCacheSource("server");
          onSelectListing?.(listing, preloadedDetail);
          return;
        }
        const { detail, source } = await loadPropertyDetailCacheFirst(listing, provider, false);
        setSelectedDetail(detail);
        setDetailCacheSource(source === "network" ? null : source);
        onSelectListing?.(listing, detail);
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : "Dettaglio non disponibile");
      } finally {
        setDetailLoading(false);
      }
    },
    [provider, onSelectListing],
  );

  const handleOpenSimilarRent = useCallback(
    (saleDetail: ListingDetail, rent: MapListing) => {
      onUseSimilarRent?.(saleDetail, rent);
      void handleSelect(rent);
    },
    [onUseSimilarRent, handleSelect],
  );

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setSelectedId(null);
    setSelectedDetail(null);
    setDetailError(null);
    setDetailCacheSource(null);
  };

  const handleBatchSaved = useCallback(
    (saved: CombinedListingsData) => {
      setCombinedData(saved);
      if (saved.sale) {
        writeLocalListingsCache(saved.sale);
        setSaleCache(saved.sale);
      }
      if (saved.rent) {
        writeLocalListingsCache(saved.rent);
        setRentCache(saved.rent);
      }
      setViewMode("both");
      setFromCache(false);

      const displayCity = saved.center.display_name?.split(",")[0]?.trim();
      if (displayCity) {
        setCity(displayCity);
        onCityChange?.(displayCity);
      }
    },
    [onCityChange],
  );

  const isCombinedView = viewMode === "both" || combinedData != null;
  const baseListings =
    combinedData?.listings ??
    (viewMode === "both"
      ? [...(saleCache?.listings ?? []), ...(rentCache?.listings ?? [])]
      : viewMode === "sale"
        ? (saleCache?.listings ?? [])
        : (rentCache?.listings ?? []));

  const activeCache = viewMode === "rent" ? rentCache : saleCache ?? rentCache;
  const center = combinedData?.center ?? saleCache?.center ?? rentCache?.center;
  const mapCenterPoint = center ? { lat: center.lat, lng: center.lng } : null;

  const displayListings = useMemo(
    () => filterListings(baseListings, filters, mapCenterPoint),
    [baseListings, filters, mapCenterPoint],
  );

  const visibleListings = useMemo(() => {
    if (!mapBounds) return displayListings;
    return filterListingsByBounds(displayListings, mapBounds);
  }, [displayListings, mapBounds]);

  const filtersActive = hasActiveFilters(filters);
  const areaFilterCenter = resolveAreaFilterCenter(filters, mapCenterPoint);
  const areaFilterRadius = resolveAreaFilterRadius(filters);
  const mapData: CityListingsCache | null = center
    ? {
        city:
          combinedData?.sale?.city ??
          combinedData?.rent?.city ??
          saleCache?.city ??
          rentCache?.city ??
          city.replace(/\s+/g, "_").toLowerCase(),
        operation: viewMode === "rent" ? "rent" : "sale",
        fetched_at:
          combinedData?.fetched_at ?? saleCache?.fetched_at ?? rentCache?.fetched_at ?? "",
        center,
        listings: displayListings,
        provider:
          combinedData?.provider ?? saleCache?.provider ?? rentCache?.provider ?? provider,
      }
    : null;

  return (
    <div className="card-glass overflow-hidden">
      <div className="border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <MapPin size={18} className="text-accent" />
          <h2 className="font-semibold text-slate-100">Mappa annunci Idealista</h2>
        </div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Cerca per città</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            className="input-field min-w-[140px] flex-1"
            placeholder="Città (es. Reggio Calabria)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <div className="flex rounded-lg border border-surface-border overflow-hidden">
            {(
              [
                { id: "sale" as const, label: "Vendita" },
                { id: "rent" as const, label: "Affitto" },
                { id: "both" as const, label: "Entrambi" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewMode(id)}
                className={cn(
                  "px-3 py-2 text-sm",
                  viewMode === id ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => setBatchOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent hover:bg-accent/20"
          >
            <Layers size={14} />
            Importazione batch
          </button>
        </div>
        <ListingsMapFilters
          viewMode={viewMode}
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(EMPTY_LISTINGS_FILTERS)}
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {mapData && (
          <p className="mt-2 text-xs text-slate-500">
            {filtersActive ? `${displayListings.length} di ${baseListings.length} annunci` : `${displayListings.length} annunci`}
            {isCombinedView && " (vendita + affitto)"}
            {" · "}
            {mapData.center.display_name ?? city}
            {mapData.provider
              ? ` · ${mapData.provider === "rapidapi" ? "RapidAPI" : "ScrapingBee"}`
              : ""}
            {combinedData
              ? " · importazione batch"
              : fromCache
                ? " · da cache"
                : viewMode === "both"
                  ? ` · ${cacheFileLabel(city, "sale")}, ${cacheFileLabel(city, "rent")}`
                  : ` · ${cacheFileLabel(city, viewMode)}`}
            {mapData.fetched_at && (
              <span className="text-slate-600">
                {" "}
                · {new Date(mapData.fetched_at).toLocaleString("it-IT")}
              </span>
            )}
          </p>
        )}
      </div>

      {!detailOpen && (
        <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
          <div className="h-[400px] border-b border-surface-border/80 lg:border-b-0 lg:border-r">
            {mapData ? (
              <ListingsMapView
                data={mapData}
                selectedId={selectedId}
                hoveredListingKey={hoveredListingKey}
                onSelect={handleSelect}
                combinedListings={isCombinedView ? displayListings : undefined}
                viewportListings={visibleListings}
                onViewportBoundsChange={setMapBounds}
                areaRadiusM={combinedData?.areaRadiusM}
                filterAreaCenter={areaFilterCenter}
                filterAreaRadiusM={areaFilterRadius}
                onFilterAreaCenterChange={(lat, lng) =>
                  setFilters((prev) => ({ ...prev, areaLat: lat, areaLng: lng }))
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                Inserisci una città — gli annunci in cache si caricano automaticamente
              </div>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto p-3">
            {mapBounds && visibleListings.length < displayListings.length && (
              <p className="mb-2 text-[11px] text-slate-500">
                {visibleListings.length} in vista · {displayListings.length} totali
              </p>
            )}
            {visibleListings.map((listing) => {
              const key = listingKey(listing);
              return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelect(listing)}
                onMouseEnter={() => setHoveredListingKey(key)}
                onMouseLeave={() => setHoveredListingKey(null)}
                className={cn(
                  "mb-2 w-full rounded-lg border p-3 text-left text-sm transition-colors",
                  selectedId === listing.id
                    ? "border-accent/50 bg-accent/10"
                    : hoveredListingKey === key
                      ? "border-accent/30 bg-accent/5"
                      : "border-surface-border/60 hover:bg-surface-raised/50",
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  {isCombinedView && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                        listing.operation === "sale"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-blue-500/20 text-blue-400",
                      )}
                    >
                      {listing.operation === "sale" ? "Vendita" : "Affitto"}
                    </span>
                  )}
                </div>
                <p className="font-medium text-slate-200 line-clamp-2">{listing.title}</p>
                <p className="mt-1 text-accent">{formatPrice(listing.price, listing.operation)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[listing.sqm != null && `${listing.sqm} m²`, listing.rooms != null && `${listing.rooms} locali`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
              );
            })}
            {mapData && visibleListings.length === 0 && (
              <p className="text-sm text-slate-500">
                {displayListings.length === 0
                  ? "Nessun annuncio trovato"
                  : "Nessun annuncio in questa area — sposta o zooma la mappa"}
              </p>
            )}
          </div>
        </div>
      )}

      {detailOpen && !mapData && !activeCache && (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          Caricamento…
        </div>
      )}

      <PropertyDetailPanel
        open={detailOpen}
        detail={selectedDetail}
        loading={detailLoading}
        error={detailError}
        provider={provider}
        cacheSource={detailCacheSource}
        mapCity={city}
        onClose={handleCloseDetail}
        onOpenSimilarRent={handleOpenSimilarRent}
        onUseAverageRent={onUseAverageRent}
      />

      <BatchFetchPanel
        open={batchOpen}
        city={city}
        provider={provider}
        providersAvailable={providersAvailable}
        onClose={() => setBatchOpen(false)}
        onSaved={handleBatchSaved}
      />
    </div>
  );
}
