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
import ListingProfitPanel from "@/components/ListingProfitPanel";
import { cn, fmtMoney } from "@/lib/utils";
import type { MarketId } from "@/lib/markets";
import type { ListingsExportContext } from "@/lib/listings-export";
import { enrichSaleListingsForExport, hydratePropertyDetailsFromLatestExport } from "@/lib/listings-export";
import type { SimilarRentEstimateMethod } from "@/lib/rent-price-basis";
import {
  emptyListingsFilters,
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
import { filterListingsByBounds, type GeoBounds, type GeoPolygon } from "@/lib/geo-filter";
import {
  deleteSavedMapPolygon,
  loadSavedMapPolygons,
  saveMapPolygon,
  type SavedMapPolygon,
} from "@/lib/map-polygon-filters";
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
  defaultListingProfitSettings,
  loadListingProfitSettings,
  saveListingProfitSettings,
  sanitizeListingProfitSettings,
  type ListingProfitSettings,
} from "@/lib/listing-profit-settings";
import { conditionLabelForMarket, listingsUiLabels } from "@/lib/listings-ui-labels";
import { useI18n } from "@/lib/i18n/context";
import { czechRoomLayoutFromListing } from "@/lib/czech-room-layout";
import { Layers, Link2, MapPin } from "lucide-react";
import type { CombinedListingsData } from "@/lib/types";

const ListingsMapView = dynamic(() => import("./ListingsMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">Caricamento mappa…</div>
  ),
});

const ListingPriceRentScatter = dynamic(() => import("./ListingPriceRentScatter"), {
  ssr: false,
  loading: () => (
    <div className="border-t border-surface-border px-4 py-6 text-center text-sm text-neutral-500">
      Caricamento grafico…
    </div>
  ),
});

function formatPrice(
  price: number,
  operation: "sale" | "rent",
  market: MarketId,
  perMonthSuffix: string,
) {
  const formatted = fmtMoney(price, market);
  return operation === "rent" ? `${formatted}${perMonthSuffix}` : formatted;
}

function pricePerSqm(listing: MapListing): number | null {
  if (listing.sqm == null || listing.sqm <= 0) return null;
  return listing.price / listing.sqm;
}

function formatPricePerSqm(listing: MapListing, market: MarketId, perSqmSuffix: string): string | null {
  const pps = pricePerSqm(listing);
  return pps != null ? `${fmtMoney(Math.round(pps), market)}${perSqmSuffix}` : null;
}

function formatProfitAmount(value: number, market: MarketId): string {
  return new Intl.NumberFormat(market === "cz" ? "cs-CZ" : "it-IT", {
    style: "currency",
    currency: market === "cz" ? "CZK" : "EUR",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(value);
}

function listingKey(listing: MapListing): string {
  return `${listing.operation}-${listing.id}`;
}

type ViewMode = "sale" | "rent" | "both";

interface Props {
  market: MarketId;
  defaultCity: string;
  onSelectListing?: (listing: MapListing, detail?: ListingDetail) => void;
  onUseSimilarRent?: (saleDetail: ListingDetail, rentListing: MapListing) => void;
  onUseAverageRent?: (
    saleDetail: ListingDetail,
    similarRentals: MapListing[],
    estimateMethod: SimilarRentEstimateMethod,
  ) => void;
  onCityChange?: (city: string) => void;
  onExportContextChange?: (ctx: ListingsExportContext) => void;
  cacheRefreshToken?: number;
}

function persistPatchedCache(market: MarketId, cache: CityListingsCache | null): CityListingsCache | null {
  if (cache) writeLocalListingsCache(market, cache);
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

export default function ListingsMap({
  market,
  defaultCity,
  onSelectListing,
  onUseSimilarRent,
  onUseAverageRent,
  onCityChange,
  onExportContextChange,
  cacheRefreshToken = 0,
}: Props) {
  const { t } = useI18n();
  const [city, setCity] = useState(defaultCity);
  const [viewMode, setViewMode] = useState<ViewMode>("sale");
  const [provider, setProvider] = useState<ListingsProvider>("rapidapi");
  const [providersAvailable, setProvidersAvailable] = useState({
    scrapingbee: false,
    rapidapi: false,
    realtyapi: false,
  });
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
  const [filters, setFilters] = useState<ListingsFilters>(() => emptyListingsFilters(market));
  const [mapBounds, setMapBounds] = useState<GeoBounds | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [profitSettings, setProfitSettings] = useState<ListingProfitSettings>(DEFAULT_LISTING_PROFIT_SETTINGS);
  const [profitSettingsReady, setProfitSettingsReady] = useState(false);
  const [profitFilters, setProfitFilters] = useState<ListingProfitFilters>(EMPTY_LISTING_PROFIT_FILTERS);
  const [profitFiltersReady, setProfitFiltersReady] = useState(false);
  const [savedPolygons, setSavedPolygons] = useState<SavedMapPolygon[]>([]);

  useEffect(() => {
    if (!city.trim()) {
      setSavedPolygons([]);
      return;
    }
    setSavedPolygons(loadSavedMapPolygons(city));
  }, [city]);

  const polygonDrawActive = filters.areaPreset === "polygon";

  const handlePolygonChange = useCallback((points: GeoPolygon | null) => {
    setFilters((prev) => ({ ...prev, areaPolygon: points }));
  }, []);

  const handleSavePolygon = useCallback(
    (name: string) => {
      if (!city.trim() || !filters.areaPolygon || filters.areaPolygon.length < 3) return;
      const saved = saveMapPolygon(city, name, filters.areaPolygon);
      setSavedPolygons((prev) => [saved, ...prev]);
    },
    [city, filters.areaPolygon],
  );

  const handleLoadSavedPolygon = useCallback(
    (id: string) => {
      const saved = savedPolygons.find((p) => p.id === id);
      if (!saved) return;
      setFilters((prev) => ({
        ...prev,
        areaPreset: "polygon",
        areaPolygon: saved.points,
        areaLat: null,
        areaLng: null,
      }));
    },
    [savedPolygons],
  );

  const handleDeleteSavedPolygon = useCallback(
    (id: string) => {
      if (!city.trim()) return;
      const next = deleteSavedMapPolygon(city, id);
      setSavedPolygons(next);
    },
    [city],
  );

  useEffect(() => {
    setProfitSettings(loadListingProfitSettings(market));
    setProfitFilters(loadListingProfitFilters());
    setProfitSettingsReady(true);
    setProfitFiltersReady(true);
  }, [market]);

  useEffect(() => {
    if (!profitSettingsReady) return;
    saveListingProfitSettings(profitSettings);
  }, [profitSettings, profitSettingsReady]);

  useEffect(() => {
    if (!profitFiltersReady) return;
    saveListingProfitFilters(profitFilters);
  }, [profitFilters, profitFiltersReady]);

  const handleProfitSettingsChange = useCallback((next: ListingProfitSettings) => {
    setProfitSettings(sanitizeListingProfitSettings(next, defaultListingProfitSettings(market)));
  }, [market]);

  const handleProfitFiltersChange = useCallback((next: ListingProfitFilters) => {
    setProfitFilters(sanitizeListingProfitFilters(next));
  }, []);

  useEffect(() => {
    setMapBounds(null);
  }, [detailOpen]);

  useEffect(() => {
    getListingsProviders()
      .then((p) => {
        setProvidersAvailable({
          scrapingbee: p.scrapingbee,
          rapidapi: p.rapidapi,
          realtyapi: p.realtyapi,
        });
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
        loadCityListingsCacheOnly(market, city.trim(), "sale"),
        loadCityListingsCacheOnly(market, city.trim(), "rent"),
        getCachedListings(city.trim(), "sale", market).catch(() => null),
        getCachedListings(city.trim(), "rent", market).catch(() => null),
      ]);
      const mergedSale = mergeCityCacheConditionFromServer(saleResult.data, serverSale);
      const mergedRent = mergeCityCacheConditionFromServer(rentResult.data, serverRent);
      if (mergedSale) writeLocalListingsCache(market, mergedSale);
      if (mergedRent) writeLocalListingsCache(market, mergedRent);
      hydratePropertyDetailsFromLatestExport(market, city.trim());
      setSaleCache(mergedSale);
      setRentCache(mergedRent);
      setCombinedData(null);
      setFromCache(true);
      setFilters(emptyListingsFilters(market));
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
  }, [city, market, onCityChange]);

  useEffect(() => {
    void loadCachesOnly();
  }, [loadCachesOnly, cacheRefreshToken]);

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
              persistPatchedCache(market, patchListingInCache(cache, listing, preloadedDetail)),
            );
            setRentCache((cache) =>
              persistPatchedCache(market, patchListingInCache(cache, listing, preloadedDetail)),
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
          setSaleCache((cache) => persistPatchedCache(market, patchListingInCache(cache, listing, detail)));
          setRentCache((cache) => persistPatchedCache(market, patchListingInCache(cache, listing, detail)));
        }
        onSelectListing?.(listing, detail);
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : "Dettaglio non disponibile");
      } finally {
        setDetailLoading(false);
      }
    },
    [provider, market, onSelectListing],
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
          writeLocalListingsCache(market, merged);
          return merged;
        });
      } else {
        setRentCache((cache) => {
          const merged = mergeImportedIntoCache(cache, imported);
          writeLocalListingsCache(market, merged);
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
  }, [importUrl, provider, market, onCityChange]);

  const handleBatchSaved = useCallback(
    (saved: CombinedListingsData) => {
      setCombinedData(saved);
      if (saved.sale) {
        writeLocalListingsCache(market, saved.sale);
        setSaleCache(saved.sale);
      }
      if (saved.rent) {
        writeLocalListingsCache(market, saved.rent);
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
    [market, onCityChange],
  );

  const isCombinedView = viewMode === "both" || combinedData != null;
  const baseListings = useMemo(() => {
    if (combinedData?.listings) return combinedData.listings;
    if (viewMode === "both") {
      return [...(saleCache?.listings ?? []), ...(rentCache?.listings ?? [])];
    }
    if (viewMode === "sale") return saleCache?.listings ?? [];
    return rentCache?.listings ?? [];
  }, [combinedData?.listings, viewMode, saleCache?.listings, rentCache?.listings]);

  const activeCache = viewMode === "rent" ? rentCache : saleCache ?? rentCache;
  const center = combinedData?.center ?? saleCache?.center ?? rentCache?.center;
  const mapCenterPoint = useMemo(
    () => (center ? { lat: center.lat, lng: center.lng } : null),
    [center?.lat, center?.lng],
  );

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
    return computeListingProfitPreviews(sales, rentPool, profitSettings, market);
  }, [displayListings, rentPool, profitSettings, showProfitPreview, market]);

  const profitFilteredListings = useMemo(() => {
    if (!showProfitPreview) return displayListings;
    return applyListingProfitFilters(displayListings, profitPreviews, profitFilters);
  }, [displayListings, profitPreviews, profitFilters, showProfitPreview]);

  const visibleListings = useMemo(() => {
    if (!mapBounds) return profitFilteredListings;
    const inBounds = filterListingsByBounds(profitFilteredListings, mapBounds);
    if (inBounds.length === 0 && profitFilteredListings.length > 0) {
      return profitFilteredListings;
    }
    return inBounds;
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

  const ui = listingsUiLabels(market, t);

  useEffect(() => {
    if (!onExportContextChange) return;
    const saleSource =
      combinedData?.listings?.filter((l) => l.operation === "sale") ??
      saleCache?.listings ??
      (viewMode === "both"
        ? [...(saleCache?.listings ?? []), ...(rentCache?.listings ?? [])]
        : viewMode === "sale"
          ? (saleCache?.listings ?? [])
          : []
      ).filter((l) => l.operation === "sale");
    const allSale = enrichSaleListingsForExport(saleSource);
    onExportContextChange({
      market,
      city,
      provider: combinedData?.provider ?? saleCache?.provider ?? rentCache?.provider ?? provider,
      saleListings: allSale,
      rentPool,
      filters,
      mapCenterPoint,
      mapBounds,
      profitSettings,
      profitFilters,
      hasData: allSale.length > 0,
    });
  }, [
    onExportContextChange,
    market,
    city,
    provider,
    viewMode,
    combinedData,
    saleCache,
    rentCache,
    rentPool,
    filters,
    mapCenterPoint,
    mapBounds,
    profitSettings,
    profitFilters,
  ]);

  return (
    <div className="card overflow-x-hidden">
      <div className="border-b border-surface-border bg-neutral-50 px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <MapPin size={18} className="text-neutral-900" />
          <h2 className="font-semibold text-neutral-900">{ui.mapTitle}</h2>
        </div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">{ui.searchCity}</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            className="input-field min-w-[140px] flex-1"
            placeholder={market === "cz" ? t("listings.cityPlaceholderCz") : t("listings.cityPlaceholderIt")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            readOnly={market === "cz"}
          />
          <div className="flex rounded-lg border border-surface-border overflow-hidden">
            {(
              [
                { id: "sale" as const, label: ui.sale },
                { id: "rent" as const, label: ui.rent },
                { id: "both" as const, label: ui.both },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewMode(id)}
                className={cn(
                  "px-3 py-2 text-sm",
                  viewMode === id ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:text-neutral-800",
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
            className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 hover:bg-neutral-100"
          >
            <Layers size={14} />
            {t("listings.batchImport")}
          </button>
        </div>
        {market === "it" && (
          <>
        <p className="mb-3 mt-4 text-xs font-medium uppercase tracking-wide text-neutral-500">
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
            className="flex items-center gap-1 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
          >
            <Link2 size={14} />
            {importLoading ? "Importazione…" : "Importa annuncio"}
          </button>
        </div>
          </>
        )}
        <ListingsMapFilters
          market={market}
          viewMode={viewMode}
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(emptyListingsFilters(market))}
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {importError && <p className="mt-2 text-sm text-red-400">{importError}</p>}
        {mapData && (
          <p className="mt-2 text-xs text-neutral-500">
            {filtersActive || profitFiltersActive
              ? `${profitFilteredListings.length} di ${baseListings.length} annunci`
              : `${profitFilteredListings.length} annunci`}
            {isCombinedView && " (vendita + affitto)"}
            {" · "}
            {mapData.center.display_name ?? city}
            {websiteSourceLabel ? ` · ${websiteSourceLabel}` : ""}
            {mapData.provider
              ? ` · ${
                  mapData.provider === "sreality"
                    ? "Sreality"
                    : mapData.provider === "rapidapi"
                    ? "RapidAPI"
                    : mapData.provider === "realtyapi"
                      ? "RealtyAPI"
                      : mapData.provider === "direct"
                        ? "Diretto"
                        : "ScrapingBee"
                }`
              : ""}
            {combinedData
              ? " · importazione batch"
              : fromCache
                ? " · da cache"
                : viewMode === "both"
                  ? ` · ${cacheFileLabel(market, city, "sale")}, ${cacheFileLabel(market, city, "rent")}`
                  : ` · ${cacheFileLabel(market, city, viewMode)}`}
            {mapData.fetched_at && (
              <span className="text-neutral-500">
                {" "}
                · {new Date(mapData.fetched_at).toLocaleString("it-IT")}
              </span>
            )}
          </p>
        )}
      </div>

      <div className={cn(detailOpen && "hidden")}>
        <>
        <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
          <div className="h-[400px] overflow-hidden border-b border-surface-border lg:border-b-0 lg:border-r">
            {mapData ? (
              <ListingsMapView
                data={mapData}
                selectedId={selectedId}
                hoveredListingKey={hoveredListingKey}
                onSelect={handleSelect}
                combinedListings={isCombinedView ? displayListings : undefined}
                viewportListings={profitFilteredListings}
                onViewportBoundsChange={setMapBounds}
                areaRadiusM={combinedData?.areaRadiusM}
                filterAreaCenter={areaFilterCenter}
                filterAreaRadiusM={areaFilterRadius}
                onFilterAreaCenterChange={(lat, lng) =>
                  setFilters((prev) => ({ ...prev, areaLat: lat, areaLng: lng }))
                }
                profitPreviews={showProfitPreview ? profitPreviews : undefined}
                profitRange={showProfitPreview ? profitRange : undefined}
                polygonFilter={filters.areaPolygon}
                polygonDrawActive={polygonDrawActive}
                onPolygonChange={polygonDrawActive ? handlePolygonChange : undefined}
                savedPolygons={savedPolygons}
                onSavePolygon={handleSavePolygon}
                onLoadSavedPolygon={handleLoadSavedPolygon}
                onDeleteSavedPolygon={handleDeleteSavedPolygon}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                {ui.loadCityHint}
              </div>
            )}
          </div>
          <div className="flex max-h-[400px] flex-col border-surface-border">
            {showProfitPreview && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-border/60 bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-neutral-700">{ui.estNetProfit}</p>
                  <p className="truncate text-[10px] text-neutral-500">
                    {profitSettingsSummary(profitSettings, market)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ListingProfitPanel
                    filters={profitFilters}
                    settings={profitSettings}
                    onFiltersChange={handleProfitFiltersChange}
                    onSettingsChange={handleProfitSettingsChange}
                  />
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {mapBounds && visibleListings.length < profitFilteredListings.length && (
              <p className="mb-2 text-[11px] text-neutral-500">
                {ui.inView(visibleListings.length, profitFilteredListings.length)}
                {profitFiltersActive ? (market === "cz" ? " (filtry zisku)" : " (filtri utile)") : ""}
              </p>
            )}
            {!mapBounds && profitFiltersActive && profitFilteredListings.length < displayListings.length && (
              <p className="mb-2 text-[11px] text-neutral-900/80">
                {ui.profitFilters(profitFilteredListings.length, displayListings.length)}
              </p>
            )}
            {visibleListings.map((listing) => {
              const key = listingKey(listing);
              const statoLabel = conditionLabelForMarket(listingConditionLabel(listing), market);
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
                    ? "border-neutral-900 bg-neutral-50"
                    : hoveredListingKey === key
                      ? "border-neutral-300 bg-neutral-50"
                      : profit
                        ? "hover:brightness-110"
                        : "border-surface-border/60 hover:bg-neutral-100/50",
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {isCombinedView && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                        listing.operation === "sale"
                          ? "bg-green-50 text-green-600"
                          : "bg-blue-500/20 text-blue-400",
                      )}
                    >
                      {listing.operation === "sale" ? ui.sale : ui.rent}
                    </span>
                  )}
                </div>
                <p className="font-medium text-neutral-800 line-clamp-2">{listing.title}</p>
                <p className="mt-1 text-neutral-900">{formatPrice(listing.price, listing.operation, market, ui.perMonth)}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {[
                    listing.sqm != null && `${listing.sqm} m²`,
                    formatPricePerSqm(listing, market, ui.perSqm),
                    listing.rooms != null &&
                      (market === "cz"
                        ? (czechRoomLayoutFromListing(listing) ?? ui.rooms(listing.rooms))
                        : ui.rooms(listing.rooms)),
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
                          ? "text-green-600"
                          : "text-neutral-600",
                    )}
                  >
                    {ui.condition}: {statoLabel}
                  </p>
                )}
                {profit && (
                  <p
                    className="mt-1.5 text-xs font-semibold"
                    style={profitGradientTextStyle(profit.monthlyNetProfit, profitRange)}
                  >
                    {ui.netProfit}: {formatProfitAmount(profit.monthlyNetProfit, market)}{ui.perMonth}
                  </p>
                )}
                {profit && (
                  <p className="mt-0.5 text-[10px] leading-snug text-neutral-500">
                    {formatProfitAmount(profit.year1NetProfit, market)}{ui.perYear} · {ui.estRent}{" "}
                    {formatPrice(profit.estimatedMonthlyRent, "rent", market, ui.perMonth)}
                    {profitSettings.rentMethod === "per_sqm" &&
                      profit.avgRentPerSqm != null &&
                      ` · ${fmtMoney(Math.round(profit.avgRentPerSqm), market)}${ui.perSqm}`}
                    {profitSettings.rentMethod === "per_room" &&
                      profit.avgRentPerRoom != null &&
                      ` · ${fmtMoney(Math.round(profit.avgRentPerRoom), market)}${ui.perRoom}`}
                    {" · "}
                    {ui.rentsInArea(profit.neighborCount)}
                  </p>
                )}
              </button>
              );
            })}
            {mapData && visibleListings.length === 0 && (
              <p className="text-sm text-neutral-500">
                {profitFilteredListings.length === 0
                  ? ui.noListings
                  : ui.noListingsInArea}
              </p>
            )}
            </div>
          </div>
        </div>
        </>
      </div>

      {showProfitPreview && (
        <ListingPriceRentScatter
          market={market}
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
        />
      )}

      {detailOpen && !mapData && !activeCache && (
        <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
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
        market={market}
        profitSettings={profitSettings}
        onClose={handleCloseDetail}
        onOpenSimilarRent={handleOpenSimilarRent}
        onUseAverageRent={onUseAverageRent}
      />

      <BatchFetchPanel
        open={batchOpen}
        market={market}
        city={city}
        provider={provider}
        providersAvailable={providersAvailable}
        onClose={() => setBatchOpen(false)}
        onSaved={handleBatchSaved}
      />
    </div>
  );
}
