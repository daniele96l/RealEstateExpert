"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadMarketHistoryCacheFirst, loadCityListingsCacheOnly } from "@/lib/cache-first";
import { getMarket, type MarketId } from "@/lib/markets";
import { fmtMoney } from "@/lib/utils";
import { marketCacheFileLabel } from "@/lib/market-cache-client";
import type { MarketPriceHistory, PriceHistoryPoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, RefreshCw, TrendingUp } from "lucide-react";

interface Props {
  city: string;
  market?: import("@/lib/markets").MarketId;
  saleCache?: import("@/lib/types").CityListingsCache | null;
  rentCache?: import("@/lib/types").CityListingsCache | null;
}

const CHART_COLORS = {
  sale: "#60a5fa",
  rent: "#34d399",
  grid: "#2a3544",
  axis: "#64748b",
};

function formatPrice(value: number, contract: "sale" | "rent") {
  if (contract === "rent") {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function downsample(points: PriceHistoryPoint[], maxPoints = 36): PriceHistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

function PriceChart({
  title,
  contract,
  points,
}: {
  title: string;
  contract: "sale" | "rent";
  points: PriceHistoryPoint[];
}) {
  const data = downsample(points).map((p) => ({
    label: p.label,
    price: p.price_sqm_avg,
  }));

  return (
    <div className="rounded-xl border border-surface-border/60 bg-surface-raised/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
          <h3 className="text-sm font-semibold text-slate-100">Prezzo medio (€/m²)</h3>
        </div>
        {data.length > 0 && (
          <p className="text-lg font-semibold text-slate-100">
            {formatPrice(data[data.length - 1].price, contract)}
          </p>
        )}
      </div>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">Nessun dato disponibile</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART_COLORS.axis, fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={28}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
              tickFormatter={(v) => (contract === "rent" ? `€${v}` : `€${Math.round(v)}`)}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "#1a2332",
                border: "1px solid #2a3544",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [formatPrice(value, contract), "€/m²"]}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke={CHART_COLORS[contract]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function MarketPriceCharts({ city, market = "it" }: Props) {
  const [data, setData] = useState<MarketPriceHistory | null>(null);
  const [czSaleMedian, setCzSaleMedian] = useState<number | null>(null);
  const [czRentMedian, setCzRentMedian] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheSource, setCacheSource] = useState<"server" | "local" | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!city.trim()) return;

      if (market === "cz") {
        setLoading(true);
        setError(null);
        setWarning(null);
        try {
          const [sale, rent] = await Promise.all([
            loadCityListingsCacheOnly(market, city.trim(), "sale"),
            loadCityListingsCacheOnly(market, city.trim(), "rent"),
          ]);
          const saleMedians = (sale.data?.listings ?? [])
            .filter((l) => l.sqm != null && l.sqm > 0)
            .map((l) => l.price / (l.sqm as number))
            .sort((a, b) => a - b);
          const rentMedians = (rent.data?.listings ?? [])
            .filter((l) => l.sqm != null && l.sqm > 0)
            .map((l) => l.price / (l.sqm as number))
            .sort((a, b) => a - b);
          const mid = (arr: number[]) =>
            arr.length ? arr[Math.floor(arr.length / 2)] : null;
          setCzSaleMedian(mid(saleMedians));
          setCzRentMedian(mid(rentMedians));
          setFromCache(true);
          setCacheSource(
            sale.source === "network" || sale.source == null
              ? rent.source === "network"
                ? null
                : rent.source ?? null
              : sale.source,
          );
          setData(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Errore caricamento dati mercato");
        } finally {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      setWarning(null);
      try {
        const { data: result, source } = await loadMarketHistoryCacheFirst(city.trim(), refresh);
        setData(result);
        setFromCache(source !== "network");
        setCacheSource(source === "network" ? null : source);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Errore caricamento dati mercato";
        try {
          const { data: cached, source } = await loadMarketHistoryCacheFirst(city.trim(), false);
          setData(cached);
          setFromCache(true);
          setCacheSource(source === "network" ? null : source);
          setWarning(
            refresh
              ? `Aggiornamento non riuscito (${message}). Mostro dati in cache.`
              : `Download non riuscito (${message}). Mostro dati in cache.`,
          );
        } catch {
          setError(message);
          setData(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [city, market],
  );

  useEffect(() => {
    setError(null);
    setWarning(null);
    if (!city.trim()) {
      setData(null);
      setCzSaleMedian(null);
      setCzRentMedian(null);
      setFromCache(false);
      setCacheSource(null);
      return;
    }
    void load(false);
  }, [city, market, load]);

  return (
    <div className="card-glass p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <TrendingUp size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Andamento prezzi di mercato</h2>
            <p className="text-sm text-slate-500">
              {market === "cz"
                ? `Mediana prezzo Kč/m² da cache Sreality — ${city || "Brno"}`
                : `Storico prezzo medio €/m² — ${(data?.city ?? city) || "seleziona una città"}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || !city.trim()}
            onClick={() => load(true)}
            className={cn(
              "flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 hover:bg-surface-raised",
              (loading || !city.trim()) && "cursor-not-allowed opacity-50",
            )}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Aggiorna
          </button>
          {market === "it" && data?.mercato_url && (
            <a
              href={data.mercato_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 hover:bg-surface-raised"
            >
              <ExternalLink size={14} />
              immobiliare.it
            </a>
          )}
        </div>
      </div>

      {warning && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {warning}
        </p>
      )}

      {error && !data && market === "it" && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {error && market === "cz" && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {market === "cz" && !loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-surface-border/60 bg-surface-raised/20 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Vendita — mediana</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {czSaleMedian != null ? fmtMoney(Math.round(czSaleMedian), market) + "/m²" : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border/60 bg-surface-raised/20 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Affitto — mediana</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {czRentMedian != null ? fmtMoney(Math.round(czRentMedian), market) + "/m²" : "—"}
            </p>
          </div>
          {czSaleMedian == null && czRentMedian == null && !error && (
            <p className="sm:col-span-2 py-4 text-center text-sm text-slate-500">
              Storico mercato Brno — importa annunci Sreality per vedere la mediana prezzo/m²
            </p>
          )}
        </div>
      )}

      {market === "it" && !data && !loading && !error && (
        <p className="py-8 text-center text-sm text-slate-500">
          Caricamento dati mercato da cache o immobiliare.it…
        </p>
      )}

      {market === "it" && loading && !data ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          <Loader2 size={20} className="mr-2 animate-spin" />
          Caricamento dati mercato…
        </div>
      ) : market === "it" && data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PriceChart title="Vendita" contract="sale" points={data.sale ?? []} />
          <PriceChart title="Affitto" contract="rent" points={data.rent ?? []} />
        </div>
      ) : null}

      {market === "it" && data && (
        <p className="mt-4 text-xs text-slate-600">
          Dati mercato — immobiliare.it
          {data.provider === "insights" ? " (Insights API)" : " (ScrapingBee)"}
          {fromCache && cacheSource === "server" && ` · cache ${marketCacheFileLabel(city)}`}
          {fromCache && cacheSource === "local" && " · cache browser"}
          {data.fetched_at && ` · ${new Date(data.fetched_at).toLocaleString("it-IT")}`}
        </p>
      )}
    </div>
  );
}
