"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { fetchListings, getCachedListings, getListingsProviders, importFromIdealista } from "@/lib/api";
import type { CityListingsCache, ListingsProvider, MapListing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Loader2, Link2, MapPin, RefreshCw } from "lucide-react";

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
  onSelectListing?: (listing: MapListing) => void;
}

export default function ListingsMap({ onSelectListing }: Props) {
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
  const autoLoaded = useRef(false);

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
      if (!refresh) {
        const cached = await getCachedListings(city.trim(), operation);
        if (cached) {
          setData(cached);
          setFromCache(true);
          setSelectedId(null);
          return;
        }
      }
      const result = await fetchListings(city.trim(), operation, refresh, provider);
      setData(result);
      setFromCache(false);
      setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [city, operation, provider]);

  useEffect(() => {
    if (autoLoaded.current) return;
    if (!providersAvailable.rapidapi && !providersAvailable.scrapingbee) return;
    autoLoaded.current = true;
    load(false);
  }, [providersAvailable, load]);

  const importUrl = useCallback(async () => {
    if (!listingUrl.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importFromIdealista(listingUrl.trim(), provider);
      const listing = result.listings[0];
      setData(result);
      setFromCache(false);
      setOperation(result.operation);
      if (listing) {
        setSelectedId(listing.id);
        onSelectListing?.(listing);
        const cityLabel = result.center.display_name?.split(",")[0]?.trim();
        if (cityLabel) setCity(cityLabel);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importazione non riuscita");
    } finally {
      setImporting(false);
    }
  }, [listingUrl, provider, onSelectListing]);

  const handleSelect = (listing: MapListing) => {
    setSelectedId(listing.id);
    onSelectListing?.(listing);
  };

  return (
    <div className="card-glass overflow-hidden">
      <div className="border-b border-surface-border/80 bg-surface-raised/40 px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <MapPin size={18} className="text-accent" />
          <h2 className="font-semibold text-slate-100">Mappa annunci Idealista</h2>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            type="url"
            className="input-field min-w-[200px] flex-1"
            placeholder="URL annuncio (es. idealista.it/immobile/12345678/)"
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
            className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Importa URL
          </button>
        </div>
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
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {data && (
          <p className="mt-2 text-xs text-slate-500">
            {data.listings.length} annunci · {data.center.display_name ?? data.city}
            {data.provider ? ` · ${data.provider === "rapidapi" ? "RapidAPI" : "ScrapingBee"}` : ""}
            {fromCache ? " · da cache" : " · appena scaricato"}
          </p>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
        <div className="h-[400px] border-b border-surface-border/80 lg:border-b-0 lg:border-r">
          {data ? (
            <ListingsMapView data={data} selectedId={selectedId} onSelect={handleSelect} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              Inserisci una città e clicca Carica per vedere gli annunci sulla mappa
            </div>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto p-3">
          {data?.listings.map((listing) => (
            <button
              key={listing.id}
              type="button"
              onClick={() => handleSelect(listing)}
              className={cn(
                "mb-2 w-full rounded-lg border p-3 text-left text-sm transition-colors",
                selectedId === listing.id
                  ? "border-accent/50 bg-accent/10"
                  : "border-surface-border/60 hover:bg-surface-raised/50",
              )}
            >
              <p className="font-medium text-slate-200 line-clamp-2">{listing.title}</p>
              <p className="mt-1 text-accent">{formatPrice(listing.price, listing.operation)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {[listing.sqm != null && `${listing.sqm} m²`, listing.rooms != null && `${listing.rooms} locali`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </button>
          ))}
          {data && data.listings.length === 0 && (
            <p className="text-sm text-slate-500">Nessun annuncio trovato</p>
          )}
        </div>
      </div>
    </div>
  );
}
