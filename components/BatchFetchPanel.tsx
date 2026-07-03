"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { batchPreviewListingsStream, batchSaveListings, geocodeCityQuery } from "@/lib/api";
import {
  AREA_PRESETS,
  filterListingsByBounds,
  filterListingsByRadius,
  formatDistance,
  listingDistanceMeters,
  type AreaPresetId,
  type GeoBounds,
} from "@/lib/geo-filter";
import type { BatchPreviewResult, CombinedListingsData, ListingsProvider, MapListing, MapCenter } from "@/lib/types";
import type { ListingSource } from "@/lib/listing-url";
import { writeLocalListingsCache } from "@/lib/listings-cache-client";
import {
  BATCH_FETCH_ALL_PAGES,
  batchFetchPageDefault,
  batchFetchPageCap,
  batchFetchPagePresets,
  formatBatchFetchPagesLabel,
  isBatchFetchAllPages,
  resolveBatchFetchPageLimit,
} from "@/lib/batch-fetch-pages";
import { batchFetchProgressPercent, type BatchFetchProgressState } from "@/lib/batch-fetch-progress";
import type { MarketId } from "@/lib/markets";
import { cn } from "@/lib/utils";
import { CheckSquare, Loader2, MapPin, Square, X } from "lucide-react";
import dynamic from "next/dynamic";

const AreaSelectMap = dynamic(() => import("./AreaSelectMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-surface-border bg-surface-raised/40 text-sm text-slate-500">
      Caricamento mappa…
    </div>
  ),
});

interface PreviewRow {
  listing: MapListing;
  distanceM: number | null;
  selected: boolean;
}

interface Props {
  open: boolean;
  market: MarketId;
  city: string;
  provider: ListingsProvider;
  providersAvailable: { scrapingbee: boolean; rapidapi: boolean; realtyapi: boolean };
  onClose: () => void;
  onSaved: (data: CombinedListingsData) => void;
}

function countByOperation(listings: MapListing[]) {
  return {
    sale: listings.filter((l) => l.operation === "sale").length,
    rent: listings.filter((l) => l.operation === "rent").length,
  };
}

function formatOpCounts(sale: number, rent: number) {
  const parts: string[] = [];
  if (sale > 0) parts.push(`${sale} vendita`);
  if (rent > 0) parts.push(`${rent} affitto`);
  return parts.join(" · ") || "0 annunci";
}

function formatPrice(price: number, operation: "sale" | "rent") {
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
  return operation === "rent" ? `${formatted}/mese` : formatted;
}

export default function BatchFetchPanel({
  open,
  market,
  city: initialCity,
  provider: initialProvider,
  providersAvailable,
  onClose,
  onSaved,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [city, setCity] = useState(initialCity);
  const [zone, setZone] = useState("");
  const [fetchSale, setFetchSale] = useState(true);
  const [fetchRent, setFetchRent] = useState(true);
  const [provider, setProvider] = useState(initialProvider);
  const [portal, setPortal] = useState<ListingSource>("idealista");
  const [areaPreset, setAreaPreset] = useState<AreaPresetId>("city");
  const [customRadiusM, setCustomRadiusM] = useState(1500);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minSqm, setMinSqm] = useState("");
  const [preview, setPreview] = useState<BatchPreviewResult | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [bounds, setBounds] = useState<GeoBounds | null>(null);
  const [areaMode, setAreaMode] = useState<"radius" | "rectangle">("radius");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<BatchFetchProgressState | null>(null);
  const [areaCenter, setAreaCenter] = useState<MapCenter | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [maxPages, setMaxPages] = useState<number>(() => batchFetchPageDefault(market));
  const maxPagesCap = batchFetchPageCap(market);
  const pagePresets = useMemo(() => batchFetchPagePresets(market), [market]);

  useEffect(() => {
    setMaxPages(batchFetchPageDefault(market));
  }, [market]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setCity(initialCity);
      setProvider(
        portal === "immobiliare" && initialProvider === "scrapingbee" ? "rapidapi" : initialProvider,
      );
    }
  }, [open, initialCity, initialProvider, portal]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !city.trim()) {
      setAreaCenter(null);
      return;
    }

    setAreaCenter(null);

    let cancelled = false;
    const timer = setTimeout(async () => {
      setGeocoding(true);
      try {
        const geo = await geocodeCityQuery(city.trim(), zone.trim() || undefined, market);
        if (!cancelled) setAreaCenter(geo);
      } catch {
        if (!cancelled) setAreaCenter(null);
      } finally {
        if (!cancelled) setGeocoding(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, city, zone, market]);

  const radiusM = useMemo(() => {
    if (areaMode === "rectangle") return null;
    if (areaPreset === "custom") return customRadiusM;
    return AREA_PRESETS[areaPreset as keyof typeof AREA_PRESETS]?.radiusM ?? null;
  }, [areaMode, areaPreset, customRadiusM]);

  const center = preview?.center ?? areaCenter;

  const allPreviewListings = useMemo(() => {
    if (!preview) return [];
    return [...(preview.sale?.listings ?? []), ...(preview.rent?.listings ?? [])];
  }, [preview]);

  const buildRows = useCallback(
    (listings: MapListing[], selectedIds?: Set<string>): PreviewRow[] => {
      if (!center) return [];
      const minP = minPrice ? Number(minPrice) : null;
      const maxP = maxPrice ? Number(maxPrice) : null;
      const minS = minSqm ? Number(minSqm) : null;

      let filtered = listings.filter((l) => {
        if (minP != null && l.price < minP) return false;
        if (maxP != null && l.price > maxP) return false;
        if (minS != null && (l.sqm == null || l.sqm < minS)) return false;
        return true;
      });

      if (areaMode === "rectangle" && bounds) {
        filtered = filterListingsByBounds(filtered, bounds);
      } else {
        filtered = filterListingsByRadius(filtered, center, radiusM);
      }

      const defaultSelected = selectedIds ?? new Set(filtered.map((l) => l.id));
      return filtered.map((listing) => ({
        listing,
        distanceM: listingDistanceMeters(listing, center),
        selected: defaultSelected.has(listing.id),
      }));
    },
    [center, minPrice, maxPrice, minSqm, areaMode, bounds, radiusM],
  );

  useEffect(() => {
    if (!preview || !center) return;
    setRows((prev) => {
      const selectedIds = new Set(prev.filter((r) => r.selected).map((r) => r.listing.id));
      const next = buildRows(allPreviewListings, prev.length ? selectedIds : undefined);
      return next.length ? next : buildRows(allPreviewListings);
    });
  }, [preview, center, allPreviewListings, buildRows, minPrice, maxPrice, minSqm, areaMode, bounds, radiusM]);

  const handleFetch = async () => {
    if (!city.trim()) return;
    const operations: ("sale" | "rent")[] = [];
    if (fetchSale) operations.push("sale");
    if (fetchRent) operations.push("rent");
    if (!operations.length) {
      setError("Seleziona almeno Vendita o Affitto");
      return;
    }

    setFetching(true);
    setError(null);
    setFetchStatus("Recupero annunci in corso…");
    const pageLimit = resolveBatchFetchPageLimit(maxPages, market);
    setFetchProgress({
      current: 0,
      total: Math.max(1, operations.length * pageLimit),
      operation: null,
      page: 0,
      maxPages: pageLimit,
      listingsTotal: 0,
      label: "",
    });
    setPreview(null);
    setRows([]);
    setBounds(null);

    try {
      const result = await batchPreviewListingsStream(city.trim(), operations, {
        zone: zone.trim() || undefined,
        refresh: true,
        provider: market === "cz" ? "sreality" : provider,
        portal: market === "cz" ? undefined : portal,
        maxPages,
        market,
        onProgress: (progress) => {
          setFetchProgress(progress);
          setFetchStatus(
            progress.label
              ? `${progress.label} · ${progress.listingsTotal} annunci`
              : "Recupero annunci in corso…",
          );
        },
      });
      setPreview(result);
      if (result.center) setAreaCenter(result.center);
      if (result.sale) writeLocalListingsCache(market, result.sale);
      if (result.rent) writeLocalListingsCache(market, result.rent);

      const saleCount = result.sale?.listings.length ?? 0;
      const rentCount = result.rent?.listings.length ?? 0;
      setFetchStatus(
        `Recuperati ${formatOpCounts(saleCount, rentCount)} (${formatBatchFetchPagesLabel(maxPages, market)}) · salvati in data/listings/ e browser`,
      );
      setFetchProgress((prev) =>
        prev
          ? { ...prev, current: prev.total, label: "" }
          : null,
      );

      onSaved({
        center: result.center,
        listings: [
          ...(result.sale?.listings ?? []),
          ...(result.rent?.listings ?? []),
        ],
        provider: result.provider,
        fetched_at: result.fetched_at,
        areaRadiusM: areaMode === "radius" ? radiusM : null,
        sale: result.sale,
        rent: result.rent,
      });

      if (result.center) {
        const listings = [
          ...(result.sale?.listings ?? []),
          ...(result.rent?.listings ?? []),
        ];
        setRows(
          listings.map((listing) => ({
            listing,
            distanceM: listingDistanceMeters(listing, result.center),
            selected: true,
          })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recupero non riuscito");
      setFetchStatus(null);
      setFetchProgress(null);
    } finally {
      setFetching(false);
    }
  };

  const toggleRow = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.listing.id === id ? { ...r, selected: !r.selected } : r)),
    );
  };

  const selectAll = () => setRows((prev) => prev.map((r) => ({ ...r, selected: true })));
  const deselectAll = () => setRows((prev) => prev.map((r) => ({ ...r, selected: false })));

  const selectedCount = rows.filter((r) => r.selected).length;

  const handleSave = async () => {
    if (!preview || !center || selectedCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      const selected = rows.filter((r) => r.selected).map((r) => r.listing);
      const sale = selected.filter((l) => l.operation === "sale");
      const rent = selected.filter((l) => l.operation === "rent");
      const result = await batchSaveListings({
        city: preview.city,
        center,
        provider: preview.provider,
        sale,
        rent,
        market,
      });
      if (result.sale) writeLocalListingsCache(market, result.sale);
      if (result.rent) writeLocalListingsCache(market, result.rent);
      onSaved({
        center: result.center,
        listings: [...sale, ...rent],
        provider: result.provider,
        fetched_at: result.fetched_at,
        areaRadiusM: areaMode === "radius" ? radiusM : null,
        sale: result.sale,
        rent: result.rent,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const recoveredCounts = countByOperation(allPreviewListings);
  const inAreaCounts = countByOperation(rows.map((r) => r.listing));
  const selectedCounts = countByOperation(rows.filter((r) => r.selected).map((r) => r.listing));

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Importazione batch annunci"
    >
      <div
        className="card-glass flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border/80 bg-surface-raised px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-accent" />
            <h2 className="font-semibold text-slate-100">Importazione batch</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-raised hover:text-slate-200"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface px-5 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Città</label>
              <input
                type="text"
                className="input-field w-full"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Es. Milano"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Zona (opzionale)</label>
              <input
                type="text"
                className="input-field w-full"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="Es. Centro"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={fetchSale} onChange={(e) => setFetchSale(e.target.checked)} />
              Vendita
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={fetchRent} onChange={(e) => setFetchRent(e.target.checked)} />
              Affitto
            </label>
          </div>

          {market === "cz" ? (
            <p className="text-sm text-slate-400">
              Fonte: <span className="text-slate-200">Sreality.cz</span> — Brno (API pubblica)
            </p>
          ) : (
            <>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Portale</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "idealista" as const, label: "Idealista" },
                  { id: "immobiliare" as const, label: "Immobiliare.it" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPortal(id);
                    if (id === "immobiliare" && provider === "scrapingbee") {
                      setProvider("rapidapi");
                    }
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm",
                    portal === id
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-surface-border text-slate-400 hover:text-slate-200",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Provider</p>
            <div className="flex rounded-lg border border-surface-border overflow-hidden">
              {(
                portal === "immobiliare"
                  ? ([
                      { id: "realtyapi" as const, label: "RealtyAPI", enabled: providersAvailable.realtyapi },
                      { id: "rapidapi" as const, label: "RapidAPI", enabled: providersAvailable.rapidapi },
                      { id: "direct" as const, label: "Diretto", enabled: true },
                    ] as const)
                  : ([
                      { id: "rapidapi" as const, label: "RapidAPI", enabled: providersAvailable.rapidapi },
                      { id: "scrapingbee" as const, label: "ScrapingBee", enabled: providersAvailable.scrapingbee },
                    ] as const)
              ).map(({ id, label, enabled }) => (
                <button
                  key={id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setProvider(id)}
                  className={cn(
                    "px-3 py-1.5 text-sm",
                    !enabled && "cursor-not-allowed opacity-40",
                    provider === id ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {portal === "immobiliare" && provider === "rapidapi" && providersAvailable.rapidapi && (
              <p className="mt-2 text-xs text-slate-500">
                RapidAPI richiede abbonamento a &quot;Immobiliare.it Scraper&quot;. In alternativa usa RealtyAPI.
              </p>
            )}
            {portal === "immobiliare" && !providersAvailable.realtyapi && !providersAvailable.rapidapi && (
              <p className="mt-2 text-xs text-amber-400">
                Configura REALTYAPI_KEY o RAPIDAPI_KEY in .env.local — oppure usa Diretto.
              </p>
            )}
          </div>
            </>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Area</p>
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAreaMode("radius");
                  setBounds(null);
                }}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm",
                  areaMode === "radius"
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-surface-border text-slate-400",
                )}
              >
                Raggio
              </button>
              <button
                type="button"
                onClick={() => setAreaMode("rectangle")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm",
                  areaMode === "rectangle"
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-surface-border text-slate-400",
                )}
              >
                Rettangolo
              </button>
            </div>

       

            {areaMode === "radius" && (
              <div className="mb-3 flex flex-wrap gap-2">
                {(Object.keys(AREA_PRESETS) as (keyof typeof AREA_PRESETS)[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAreaPreset(key)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm",
                      areaPreset === key
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "border-surface-border text-slate-400 hover:text-slate-200",
                    )}
                  >
                    {AREA_PRESETS[key].label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAreaPreset("custom")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm",
                    areaPreset === "custom"
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-surface-border text-slate-400 hover:text-slate-200",
                  )}
                >
                  Personalizzato
                </button>
                {areaPreset === "custom" && (
                  <div className="flex w-full items-center gap-3 sm:w-auto">
                    <input
                      type="range"
                      min={500}
                      max={10000}
                      step={250}
                      value={customRadiusM}
                      onChange={(e) => setCustomRadiusM(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs text-slate-400">{formatDistance(customRadiusM)}</span>
                  </div>
                )}
              </div>
            )}

            {geocoding && !areaCenter && (
              <div className="mt-3 flex h-[260px] items-center justify-center rounded-lg border border-surface-border bg-surface-raised/50 text-sm text-slate-500">
                <Loader2 size={16} className="mr-2 animate-spin text-accent" />
                Caricamento mappa…
              </div>
            )}

            {center && (
              <div className="mt-3">
                <AreaSelectMap
                key={`${city}-${center.lat}-${center.lng}`}
                center={center}
                mode={areaMode}
                radiusM={areaMode === "radius" ? radiusM : null}
                bounds={bounds}
                onBoundsChange={setBounds}
                onCenterChange={setAreaCenter}
                previewListings={allPreviewListings}
              />
              </div>
            )}

            {!geocoding && !center && city.trim() && (
              <p className="text-xs text-amber-400">Impossibile geolocalizzare la città. Verifica il nome.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">
              Pagine {market === "cz" ? "Sreality" : portal === "immobiliare" ? "Immobiliare" : "Idealista"} per operazione
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2">
                {pagePresets.map((preset) => {
                  const isAll = preset === BATCH_FETCH_ALL_PAGES;
                  const label = isAll ? "All" : String(preset);
                  return (
                    <button
                      key={isAll ? "all" : preset}
                      type="button"
                      onClick={() => setMaxPages(preset)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm",
                        maxPages === preset
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-surface-border text-slate-400 hover:text-slate-200",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {!isBatchFetchAllPages(maxPages) && (
                <>
                  <input
                    type="range"
                    min={1}
                    max={maxPagesCap}
                    step={1}
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                    className="min-w-[120px] flex-1"
                  />
                  <span className="text-sm text-slate-300">{maxPages} pag.</span>
                </>
              )}
              <span className="text-xs text-slate-500">
                {isBatchFetchAllPages(maxPages)
                  ? market === "cz"
                    ? "Stáhnout všechny dostupné stránky (v prodej a pronájem zvlášť)"
                    : "Scarica tutte le pagine disponibili (vendita e affitto separati)"
                  : "Più pagine = più annunci (vendita e affitto separati)"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Prezzo min</label>
              <input
                type="number"
                className="input-field w-full"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="€"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Prezzo max</label>
              <input
                type="number"
                className="input-field w-full"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="€"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Min m²</label>
              <input
                type="number"
                className="input-field w-full"
                value={minSqm}
                onChange={(e) => setMinSqm(e.target.value)}
                placeholder="m²"
              />
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              disabled={fetching || !city.trim()}
              onClick={handleFetch}
              className="btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 sm:w-auto"
            >
              {fetching ? <Loader2 size={16} className="animate-spin" /> : null}
              Recupera anteprima
            </button>

            {fetching && (
              <div className="space-y-2">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-border">
                  <div
                    className={cn(
                      "h-full rounded-full bg-accent transition-[width] duration-300",
                      !fetchProgress?.current && "w-1/4 animate-pulse",
                    )}
                    style={
                      fetchProgress && fetchProgress.total > 0 && fetchProgress.current > 0
                        ? {
                            width: `${batchFetchProgressPercent(fetchProgress.current, fetchProgress.total)}%`,
                          }
                        : undefined
                    }
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {fetchProgress?.label || fetchStatus || "Recupero annunci in corso…"}
                  {fetchProgress && fetchProgress.listingsTotal > 0
                    ? ` · ${fetchProgress.listingsTotal} annunci`
                    : ""}
                  {fetchProgress && fetchProgress.total > 0
                    ? ` · ${fetchProgress.current}/${fetchProgress.total}`
                    : ""}
                </p>
              </div>
            )}

            {fetchStatus && !fetching && (
              <p className="text-xs text-slate-500">{fetchStatus}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {rows.length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Recuperati: {formatOpCounts(recoveredCounts.sale, recoveredCounts.rent)}
                  {" · "}
                  In area: {formatOpCounts(inAreaCounts.sale, inAreaCounts.rent)}
                  {" · "}
                  Selezionati: {formatOpCounts(selectedCounts.sale, selectedCounts.rent)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <CheckSquare size={12} />
                    Seleziona tutti
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:underline"
                  >
                    <Square size={12} />
                    Deseleziona
                  </button>
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto rounded-lg border border-surface-border bg-surface-raised/50">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface-raised text-xs text-slate-500">
                    <tr>
                      <th className="p-2 w-8" />
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Titolo</th>
                      <th className="p-2">Prezzo</th>
                      <th className="p-2">m²</th>
                      <th className="p-2">Distanza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ listing, distanceM, selected }) => (
                      <tr
                        key={listing.id}
                        className={cn(
                          "border-t border-surface-border/40",
                          selected ? "bg-accent/5" : "opacity-60",
                        )}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleRow(listing.id)}
                          />
                        </td>
                        <td className="p-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-xs",
                              listing.operation === "sale"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-blue-500/20 text-blue-400",
                            )}
                          >
                            {listing.operation === "sale" ? "Vendita" : "Affitto"}
                          </span>
                        </td>
                        <td className="p-2 max-w-[180px] truncate text-slate-200" title={listing.title}>
                          {listing.title}
                        </td>
                        <td className="p-2 text-accent whitespace-nowrap">
                          {formatPrice(listing.price, listing.operation)}
                        </td>
                        <td className="p-2 text-slate-400">{listing.sqm ?? "—"}</td>
                        <td className="p-2 text-slate-400 whitespace-nowrap">{formatDistance(distanceM)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-surface-border/80 bg-surface-raised px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-300 hover:bg-surface-raised"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={saving || selectedCount === 0 || !preview}
            onClick={handleSave}
            className="btn-primary flex items-center gap-2 px-4 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Salva selezionati sulla mappa
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
