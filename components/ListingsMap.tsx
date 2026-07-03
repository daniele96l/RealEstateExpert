"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { getListingsProviders, getCachedListings, importFromIdealista } from "@/lib/api";
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
import ListingProfitSettingsPanel from "@/components/ListingProfitSettingsPanel";
import ListingProfitFiltersPanel from "@/components/ListingProfitFiltersPanel";
import { cn } from "@/lib/utils";
import {
  EMPTY_LISTINGS_FILTERS,
  filterListings,
  hasActiveFilters,
  resolveAreaFilterCenter,
  resolveAreaFilterRadius,
  type ListingsFilters,
} from "@/lib/listings-filters";
import {
  formatListingsWebsiteSource,
  inferListingsWebsiteSource,
} from "@/lib/listing-url";
import { listingConditionLabel } from "@/lib/property-condition";
import { enrichListingsConditionClient } from "@/lib/listing-condition-enrich-client";
import {
  mergeCityCacheConditionFromServer,
  mergeListingCondition,
} from "@/lib/listing-condition-enrich";
import { filterListingsByBounds, type GeoBounds } from "@/lib/geo-filter";
import { computeListingProfitPreviews, profitSettingsSummary } from "@/lib/listing-profit-preview";
import {
  profitGradientBorderStyle,
  profitGradientTextStyle,
  profitRangeFromValues,
} from "@/lib/profit-gradient";
import {
  applyListingProfitFilters,
  EMPTY_LISTING_PROFIT_FILTERS,
  hasActiveListingProfitFilters,
  loadListingProfitFilters,
  saveListingProfitFilters,
  sanitizeListingProfitFilters,
  type ListingProfitFilters,
} from "@/lib/listing-profit-filters";
import {
  DEFAULT_LISTING_PROFIT_SETTINGS,
  loadListingProfitSettings,
  saveListingProfitSettings,
  sanitizeListingProfitSettings,
  type ListingProfitSettings,
} from "@/lib/listing-profit-settings";
import type { SimilarRentEstimateMethod } from "@/lib/rent-price-basis";
import { Layers, Link2, MapPin } from "lucide-react";
import type { CombinedListingsData } from "@/lib/types";

const ListingsMapView = dynamic(() => import("./ListingsMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">Caricamento mappa…</div>
  ),
});

const ListingPriceRentScatter = dynamic(() => import("./ListingPriceRentScatter"), {
  ssr: false,
  loading: () => (
    <div className="border-t border-surface-border/80 px-4 py-6 text-center text-sm text-slate-500">
      Caricamento grafico…
    </div>
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

function formatProfitEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(value);
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

function persistPatchedCache(cache: CityListingsCache | null): CityListingsCache | null {
  if (cache) writeLocalListingsCache(cache);
  return cache;
}

function patchListingInCache(
  cache: CityListingsCache | null,
  listing: MapListing,
  detail: Pick<ListingDetail, "condition" | "condition_status" | "needs_renovation">,
): CityListingsCache | null {
  if (!cache) return cache;
  if (
    detail.condition == null &&
    detail.condition_status == null &&
    detail.needs_renovation == null
  ) {
    return cache;
  }
  const idx = cache.listings.findIndex(
    (item) => item.id === listing.id && item.operation === listing.operation,
  );
  if (idx === -1) return cache;
  const listings = [...cache.listings];
  listings[idx] = {
    ...listings[idx],
    condition: detail.condition ?? listings[idx].condition,
    condition_status: detail.condition_status ?? listings[idx].condition_status,
    needs_renovation: detail.needs_renovation ?? listings[idx].needs_renovation,
  };
  return { ...cache, listings };
}

function mergeImportedIntoCache(
  cache: CityListingsCache | null,
  imported: CityListingsCache,
): CityListingsCache {
  const listing = imported.listings[0];
  if (!listing) return imported;
  if (!cache || cache.operation !== imported.operation) {
    return { ...imported, city: cache?.city ?? imported.city };
  }
  const idx = cache.listings.findIndex((item) => item.id === listing.id);
  const listings =
    idx >= 0
      ? cache.listings.map((item, i) =>
          i === idx ? mergeListingCondition(listing, item) : item,
        )
      : [...cache.listings, listing];
  return {
    ...cache,
    listings,
    fetched_at: new Date().toISOString(),
    center: cache.listings.length ? cache.center : imported.center,
    provider: imported.provider ?? cache.provider,
  };
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
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [profitSettings, setProfitSettings] = useState<ListingProfitSettings>(DEFAULT_LISTING_PROFIT_SETTINGS);
  const [profitSettingsReady, setProfitSettingsReady] = useState(false);
  const [profitFilters, setProfitFilters] = useState<ListingProfitFilters>(EMPTY_LISTING_PROFIT_FILTERS);
  const [profitFiltersReady, setProfitFiltersReady] = useState(false);

  useEffect(() => {
    setProfitSettings(loadListingProfitSettings());
    setProfitFilters(loadListingProfitFilters());
    setProfitSettingsReady(true);
    setProfitFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!profitSettingsReady) return;
    saveListingProfitSettings(profitSettings);
  }, [profitSettings, profitSettingsReady]);

  useEffect(() => {
    if (!profitFiltersReady) return;
    saveListingProfitFilters(profitFilters);
  }, [profitFilters, profitFiltersReady]);

  const handleProfitSettingsChange = useCallback((next: ListingProfitSettings) => {
    setProfitSettings(sanitizeListingProfitSettings(next));
  }, []);

  const handleProfitFiltersChange = useCallback((next: ListingProfitFilters) => {
    setProfitFilters(sanitizeListingProfitFilters(next));
  }, []);

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
      const [saleResult, rentResult, serverSale, serverRent] = await Promise.all([
        loadCityListingsCacheOnly(city.trim(), "sale"),
        loadCityListingsCacheOnly(city.trim(), "rent"),
        getCachedListings(city.trim(), "sale").catch(() => null),
        getCachedListings(city.trim(), "rent").catch(() => null),
      ]);
      const mergedSale = mergeCityCacheConditionFromServer(saleResult.data, serverSale);
      const mergedRent = mergeCityCacheConditionFromServer(rentResult.data, serverRent);
      if (mergedSale) writeLocalListingsCache(mergedSale);
      if (mergedRent) writeLocalListingsCache(mergedRent);
      setSaleCache(mergedSale);
      setRentCache(mergedRent);
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
          if (
            preloadedDetail.condition != null ||
            preloadedDetail.condition_status != null ||
            preloadedDetail.needs_renovation != null
          ) {
            setSaleCache((cache) =>
              persistPatchedCache(patchListingInCache(cache, listing, preloadedDetail)),
            );
            setRentCache((cache) =>
              persistPatchedCache(patchListingInCache(cache, listing, preloadedDetail)),
            );
          }
          onSelectListing?.(listing, preloadedDetail);
          return;
        }
        const { detail, source } = await loadPropertyDetailCacheFirst(listing, provider, false);
        setSelectedDetail(detail);
        setDetailCacheSource(source === "network" ? null : source);
        if (
          detail.condition != null ||
          detail.condition_status != null ||
          detail.needs_renovation != null
        ) {
          setSaleCache((cache) => persistPatchedCache(patchListingInCache(cache, listing, detail)));
          setRentCache((cache) => persistPatchedCache(patchListingInCache(cache, listing, detail)));
        }
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

  const handleImportUrl = useCallback(async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const imported = await importFromIdealista(url, provider);
      const listing = imported.listings[0];
      if (!listing) throw new Error("Annuncio non trovato");

      setCombinedData(null);
      setFromCache(false);

      if (listing.operation === "sale") {
        setSaleCache((cache) => {
          const merged = mergeImportedIntoCache(cache, imported);
          writeLocalListingsCache(merged);
          return merged;
        });
      } else {
        setRentCache((cache) => {
          const merged = mergeImportedIntoCache(cache, imported);
          writeLocalListingsCache(merged);
          return merged;
        });
      }

      setViewMode(listing.operation);
      setSelectedId(listing.id);
      setImportUrl("");

      const displayCity = imported.center.display_name?.split(",")[0]?.trim();
      if (displayCity) {
        setCity(displayCity);
        onCityChange?.(displayCity);
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Importazione non riuscita");
    } finally {
      setImportLoading(false);
    }
  }, [importUrl, provider, onCityChange]);

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

  const enrichedListings = useMemo(
    () => enrichListingsConditionClient(baseListings),
    [baseListings],
  );

  const displayListings = useMemo(
    () => filterListings(enrichedListings, filters, mapCenterPoint),
    [enrichedListings, filters, mapCenterPoint],
  );

  const rentPool = useMemo(
    () =>
      rentCache?.listings?.length
        ? rentCache.listings
        : baseListings.filter((l) => l.operation === "rent"),
    [rentCache, baseListings],
  );

  const showProfitPreview = viewMode === "sale" || viewMode === "both";

  const profitPreviews = useMemo(() => {
    if (!showProfitPreview) return new Map();
    const sales = displayListings.filter((l) => l.operation === "sale");
    return computeListingProfitPreviews(sales, rentPool, profitSettings);
  }, [displayListings, rentPool, profitSettings, showProfitPreview]);

  const profitFilteredListings = useMemo(() => {
    if (!showProfitPreview) return displayListings;
    return applyListingProfitFilters(displayListings, profitPreviews, profitFilters);
  }, [displayListings, profitPreviews, profitFilters, showProfitPreview]);

  const visibleListings = useMemo(() => {
    if (!mapBounds) return profitFilteredListings;
    return filterListingsByBounds(profitFilteredListings, mapBounds);
  }, [profitFilteredListings, mapBounds]);

  const profitRange = useMemo(() => {
    const values = visibleListings
      .filter((l) => l.operation === "sale")
      .map((l) => profitPreviews.get(l.id)?.monthlyNetProfit)
      .filter((v): v is number => v != null);
    return profitRangeFromValues(values);
  }, [visibleListings, profitPreviews]);

  const websiteSourceLabel = useMemo(
    () => formatListingsWebsiteSource(inferListingsWebsiteSource(baseListings)),
    [baseListings],
  );

  const filtersActive = hasActiveFilters(filters);
  const profitFiltersActive = hasActiveListingProfitFilters(profitFilters);
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
        listings: profitFilteredListings,
        provider:
          combinedData?.provider ?? saleCache?.provider ?? rentCache?.provider ?? provider,
      }
    : null;

  return (
    <div className="card-glass overflow-x-hidden">
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
        <p className="mb-3 mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          Importa annuncio
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            className="input-field min-w-[200px] flex-1"
            placeholder="Link Idealista o Immobiliare (idealista.it/immobile/… o immobiliare.it/annunci/…)"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleImportUrl();
            }}
            disabled={importLoading}
            aria-label="Link annuncio Idealista o Immobiliare"
          />
          <button
            type="button"
            disabled={importLoading || !importUrl.trim()}
            onClick={() => void handleImportUrl()}
            className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-raised/60 px-3 py-2 text-sm text-slate-200 hover:bg-surface-raised disabled:opacity-50"
          >
            <Link2 size={14} />
            {importLoading ? "Importazione…" : "Importa annuncio"}
          </button>
        </div>
        <ListingsMapFilters
          viewMode={viewMode}
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(EMPTY_LISTINGS_FILTERS)}
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {importError && <p className="mt-2 text-sm text-red-400">{importError}</p>}
        {mapData && (
          <p className="mt-2 text-xs text-slate-500">
            {filtersActive || profitFiltersActive
              ? `${profitFilteredListings.length} di ${baseListings.length} annunci`
              : `${profitFilteredListings.length} annunci`}
            {isCombinedView && " (vendita + affitto)"}
            {" · "}
            {mapData.center.display_name ?? city}
            {websiteSourceLabel ? ` · ${websiteSourceLabel}` : ""}
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
        <>
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
                profitPreviews={showProfitPreview ? profitPreviews : undefined}
                profitRange={showProfitPreview ? profitRange : undefined}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                Inserisci una città — gli annunci in cache si caricano automaticamente
              </div>
            )}
          </div>
          <div className="flex max-h-[400px] flex-col border-surface-border/80">
            {showProfitPreview && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-border/60 bg-surface-raised/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-300">Utile netto stimato</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {profitSettingsSummary(profitSettings)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ListingProfitFiltersPanel
                    filters={profitFilters}
                    onChange={handleProfitFiltersChange}
                  />
                  <ListingProfitSettingsPanel
                    settings={profitSettings}
                    onChange={handleProfitSettingsChange}
                  />
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {mapBounds && visibleListings.length < profitFilteredListings.length && (
              <p className="mb-2 text-[11px] text-slate-500">
                {visibleListings.length} in vista · {profitFilteredListings.length} totali
                {profitFiltersActive ? " (filtri utile)" : ""}
              </p>
            )}
            {!mapBounds && profitFiltersActive && profitFilteredListings.length < displayListings.length && (
              <p className="mb-2 text-[11px] text-accent/80">
                Filtri utile: {profitFilteredListings.length} di {displayListings.length} annunci
              </p>
            )}
            {visibleListings.map((listing) => {
              const key = listingKey(listing);
              const statoLabel = listingConditionLabel(listing);
              const profit = listing.operation === "sale" ? profitPreviews.get(listing.id) : null;
              return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelect(listing)}
                onMouseEnter={() => setHoveredListingKey(key)}
                onMouseLeave={() => setHoveredListingKey(null)}
                style={profit ? profitGradientBorderStyle(profit.monthlyNetProfit, profitRange) : undefined}
                className={cn(
                  "mb-2 w-full rounded-lg border p-3 text-left text-sm transition-colors",
                  selectedId === listing.id
                    ? "border-accent/50 bg-accent/10"
                    : hoveredListingKey === key
                      ? "border-accent/30 bg-accent/5"
                      : profit
                        ? "hover:brightness-110"
                        : "border-surface-border/60 hover:bg-surface-raised/50",
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
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
                  {[
                    listing.sqm != null && `${listing.sqm} m²`,
                    listing.rooms != null && `${listing.rooms} locali`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {statoLabel && (
                  <p
                    className={cn(
                      "mt-1 text-xs font-medium",
                      listing.needs_renovation === true
                        ? "text-amber-400"
                        : listing.needs_renovation === false
                          ? "text-emerald-400"
                          : "text-slate-400",
                    )}
                  >
                    Stato: {statoLabel}
                  </p>
                )}
                {profit && (
                  <p
                    className="mt-1.5 text-xs font-semibold"
                    style={profitGradientTextStyle(profit.monthlyNetProfit, profitRange)}
                  >
                    Utile netto: {formatProfitEuro(profit.monthlyNetProfit)}/mese
                  </p>
                )}
                {profit && (
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                    {formatProfitEuro(profit.year1NetProfit)}/anno · affitto stim.{" "}
                    {formatPrice(profit.estimatedMonthlyRent, "rent")}
                    {profitSettings.rentMethod === "per_sqm" &&
                      profit.avgRentPerSqm != null &&
                      ` · ${profit.avgRentPerSqm.toFixed(1)} €/m²`}
                    {profitSettings.rentMethod === "per_room" &&
                      profit.avgRentPerRoom != null &&
                      ` · ${Math.round(profit.avgRentPerRoom)} €/stanza`}
                    {" · "}
                    {profit.neighborCount} affitti in zona
                  </p>
                )}
              </button>
              );
            })}
            {mapData && visibleListings.length === 0 && (
              <p className="text-sm text-slate-500">
                {profitFilteredListings.length === 0
                  ? "Nessun annuncio trovato"
                  : "Nessun annuncio in questa area — sposta o zooma la mappa"}
              </p>
            )}
            </div>
          </div>
        </div>
        </>
      )}

      {showProfitPreview && (
        <ListingPriceRentScatter
          listings={visibleListings}
          profitPreviews={profitPreviews}
          mapInView={mapBounds != null}
          selectedId={selectedId}
          hoveredId={
            hoveredListingKey?.startsWith("sale-")
              ? hoveredListingKey.slice("sale-".length)
              : null
          }
          onSelect={(listing) => void handleSelect(listing)}
          onHover={(listing) =>
            setHoveredListingKey(listing ? listingKey(listing) : null)
          }
        />
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
