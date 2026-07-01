"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { importFromIdealista, getListingsProviders } from "@/lib/api";
import { loadCityListingsCacheFirst, loadPropertyDetailCacheFirst } from "@/lib/cache-first";
import { cacheFileLabel } from "@/lib/listings-cache-client";
import { propertyDetailCacheFileLabel } from "@/lib/property-detail-cache-client";
import { writeLocalListingsCache } from "@/lib/listings-cache-client";
import type { CityListingsCache, ListingDetail, ListingsProvider, MapListing } from "@/lib/types";
import PropertyDetailPanel from "@/components/PropertyDetailPanel";
import BatchFetchPanel from "@/components/BatchFetchPanel";
import { cn } from "@/lib/utils";
import { Layers, Loader2, Link2, MapPin, RefreshCw } from "lucide-react";
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

interface Props {
  onSelectListing?: (listing: MapListing, detail?: ListingDetail) => void;
  onUseSimilarRent?: (saleDetail: ListingDetail, rentListing: MapListing) => void;
  onUseAverageRent?: (saleDetail: ListingDetail, avgPerRoom: number, wholeMonthly: number | null) => void;
  onCityChange?: (city: string) => void;
}

export default function ListingsMap({ onSelectListing, onUseSimilarRent, onUseAverageRent, onCityChange }: Props) {
  const [city, setCity] = useState("Reggio Calabria");
  const [listingUrl, setListingUrl] = useState("");
  const [operation, setOperation] = useState<"sale" | "rent">("sale");
  const [provider, setProvider] = useState<ListingsProvider>("rapidapi");
  const [providersAvailable, setProvidersAvailable] = useState({ scrapingbee: false, rapidapi: false });
  const [data, setData] = useState<CityListingsCache | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheSource, setCacheSource] = useState<"server" | "local" | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<ListingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailCacheSource, setDetailCacheSource] = useState<"server" | "local" | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [combinedData, setCombinedData] = useState<CombinedListingsData | null>(null);
  const autoLoaded = useRef(false);

  const applyListings = useCallback((payload: CityListingsCache, cached: boolean, source: "server" | "local" | null) => {
    setData(payload);
    setCombinedData(null);
    setFromCache(cached);
    setCacheSource(source);
    setSelectedId(null);
    setDetailOpen(false);
    setSelectedDetail(null);
    writeLocalListingsCache(payload);
    const displayCity =
      payload.center.display_name?.split(",")[0]?.trim() || payload.city.replace(/_/g, " ");
    onCityChange?.(displayCity);
  }, [onCityChange]);

  useEffect(() => {
    getListingsProviders()
      .then((p) => {
        setProvidersAvailable({ scrapingbee: p.scrapingbee, rapidapi: p.rapidapi });
        setProvider(p.default_provider);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async (refresh: boolean) => {
    if (!city.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data: result, source } = await loadCityListingsCacheFirst(
        city.trim(),
        operation,
        refresh,
        provider,
      );
      applyListings(result, source !== "network", source === "network" ? null : source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [city, operation, provider, applyListings]);

  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    load(false);
  }, [load]);

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

  const importUrl = useCallback(async () => {
    if (!listingUrl.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importFromIdealista(listingUrl.trim(), provider, false);
      const listing = result.listings[0];
      applyListings(result, true, "server");
      setOperation(result.operation);
      if (listing) {
        const { detail } = await loadPropertyDetailCacheFirst(listing, provider, false);
        await handleSelect(listing, detail);
        const cityLabel = result.center.display_name?.split(",")[0]?.trim();
        if (cityLabel) setCity(cityLabel);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importazione non riuscita");
    } finally {
      setImporting(false);
    }
  }, [listingUrl, provider, applyListings, handleSelect]);

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
      if (saved.sale) writeLocalListingsCache(saved.sale);
      if (saved.rent) writeLocalListingsCache(saved.rent);

      if (saved.sale || saved.rent) {
        const cachePayload =
          operation === "rent" && saved.rent
            ? saved.rent
            : saved.sale ?? saved.rent!;
        setData(cachePayload);
        setFromCache(false);
        setCacheSource("server");
      }

      const displayCity = saved.center.display_name?.split(",")[0]?.trim();
      if (displayCity) {
        setCity(displayCity);
        onCityChange?.(displayCity);
      }
    },
    [operation, onCityChange],
  );

  const displayListings = combinedData?.listings ?? data?.listings ?? [];
  const mapData: CityListingsCache | null =
    data ??
    (combinedData
      ? {
          city: combinedData.sale?.city ?? combinedData.rent?.city ?? city.replace(/\s+/g, "_").toLowerCase(),
          operation,
          fetched_at: combinedData.fetched_at ?? "",
          center: combinedData.center,
          listings: combinedData.listings,
          provider: combinedData.provider,
        }
      : null);

  return (
    <div className="card-glass overflow-hidden">
      <div className="border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <MapPin size={18} className="text-accent" />
          <h2 className="font-semibold text-slate-100">Mappa annunci Idealista</h2>
        </div>
        <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Importa singolo annuncio</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="url"
              className="input-field min-w-[200px] flex-1"
              placeholder="https://www.idealista.it/immobile/12345678/"
              value={listingUrl}
              onChange={(e) => setListingUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") importUrl();
              }}
            />
            <button
              type="button"
              disabled={importing || !listingUrl.trim()}
              onClick={importUrl}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Importa
            </button>
          </div>
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
            {(["sale", "rent"] as const).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setOperation(op)}
                className={cn(
                  "px-3 py-2 text-sm",
                  operation === op ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {op === "sale" ? "Vendita" : "Affitto"}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-surface-border overflow-hidden">
            {(
              [
                { id: "rapidapi" as const, label: "RapidAPI", enabled: providersAvailable.rapidapi },
                { id: "scrapingbee" as const, label: "ScrapingBee", enabled: providersAvailable.scrapingbee },
              ] as const
            ).map(({ id, label, enabled }) => (
              <button
                key={id}
                type="button"
                disabled={!enabled}
                onClick={() => setProvider(id)}
                title={enabled ? undefined : "Chiave API non configurata in .env.local"}
                className={cn(
                  "px-3 py-2 text-sm",
                  !enabled && "cursor-not-allowed opacity-40",
                  provider === id ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" disabled={loading || importing} onClick={() => load(false)} className="btn-primary px-4">
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Carica"}
          </button>
          <button
            type="button"
            disabled={loading || importing}
            onClick={() => load(true)}
            className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 hover:bg-surface-raised"
          >
            <RefreshCw size={14} />
            Aggiorna
          </button>
          <button
            type="button"
            disabled={loading || importing}
            onClick={() => setBatchOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent hover:bg-accent/20"
          >
            <Layers size={14} />
            Importazione batch
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {(data || combinedData) && (
          <p className="mt-2 text-xs text-slate-500">
            {displayListings.length} annunci
            {combinedData && " (vendita + affitto)"}
            {" · "}
            {(combinedData ?? data)?.center.display_name ?? city}
            {(combinedData ?? data)?.provider
              ? ` · ${(combinedData ?? data)!.provider === "rapidapi" ? "RapidAPI" : "ScrapingBee"}`
              : ""}
            {combinedData
              ? " · importazione batch"
              : fromCache
                ? ` · da JSON (${cacheSource === "local" ? "browser" : cacheFileLabel(city, operation)})`
                : ` · salvato in ${cacheFileLabel(city, operation)}`}
            {(combinedData?.fetched_at ?? data?.fetched_at) && (
              <span className="text-slate-600">
                {" "}
                · {new Date((combinedData?.fetched_at ?? data!.fetched_at)!).toLocaleString("it-IT")}
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
                onSelect={handleSelect}
                combinedListings={combinedData?.listings}
                areaRadiusM={combinedData?.areaRadiusM}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                Inserisci una città e clicca Carica per vedere gli annunci sulla mappa
              </div>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto p-3">
            {displayListings.map((listing) => (
              <button
                key={`${listing.operation}-${listing.id}`}
                type="button"
                onClick={() => handleSelect(listing)}
                className={cn(
                  "mb-2 w-full rounded-lg border p-3 text-left text-sm transition-colors",
                  selectedId === listing.id
                    ? "border-accent/50 bg-accent/10"
                    : "border-surface-border/60 hover:bg-surface-raised/50",
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  {combinedData && (
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
            ))}
            {mapData && displayListings.length === 0 && (
              <p className="text-sm text-slate-500">Nessun annuncio trovato</p>
            )}
          </div>
        </div>
      )}

      {detailOpen && !data && (
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
        onAnalyze={(detail) => onSelectListing?.(detail, detail)}
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
