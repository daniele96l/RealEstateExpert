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
import { loadMarketHistoryCacheFirst } from "@/lib/cache-first";
import { historicalPriceCagr } from "@/lib/market-cagr";
import { getMarket, type MarketId } from "@/lib/markets";
import { fmtMoney, cn } from "@/lib/utils";
import { marketCacheFileLabel } from "@/lib/market-cache-client";
import type { MarketPriceHistory, PriceHistoryPoint } from "@/lib/types";
import { ExternalLink, Loader2, RefreshCw, TrendingUp } from "lucide-react";

interface Props {
  city: string;
  market?: MarketId;
}

const CHART_COLORS = {
  sale: "#60a5fa",
  rent: "#34d399",
  grid: "#2a3544",
  axis: "#64748b",
};

function downsample(points: PriceHistoryPoint[], maxPoints = 36): PriceHistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

function formatGrowthPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function PriceChart({
  title,
  contract,
  points,
  market = "it",
}: {
  title: string;
  contract: "sale" | "rent";
  points: PriceHistoryPoint[];
  market?: MarketId;
}) {
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const data = downsample(points).map((p) => ({
    label: p.label,
    price: p.price_sqm_avg,
  }));
  const cagrPct = historicalPriceCagr(points);
  const periodLabel =
    points.length >= 2 ? `${points[0].label} – ${points[points.length - 1].label}` : null;

  return (
    <div className="rounded-xl border border-surface-border/60 bg-surface-raised/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
          <h3 className="text-sm font-semibold text-slate-100">
            {market === "cz" ? `Průměrná cena (${currencySymbol}/m²)` : "Prezzo medio (€/m²)"}
          </h3>
        </div>
        {data.length > 0 && (
          <p className="text-lg font-semibold text-slate-100">
            {fmtMoney(Math.round(data[data.length - 1].price), market)}/m²
          </p>
        )}
      </div>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">Nessun dato disponibile</p>
      ) : data.length < 2 && market === "cz" && contract === "rent" ? (
        <p className="py-12 text-center text-sm text-slate-500">
          Storico affitto: si accumula ad ogni aggiornamento annunci ({fmtMoney(data[0].price, market)}/m²)
        </p>
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
              tickFormatter={(v) =>
                market === "cz" ? `${Math.round(v / 1000)}k` : contract === "rent" ? `€${v}` : `€${Math.round(v)}`
              }
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
              formatter={(value: number) => [fmtMoney(value, market) + "/m²", currencySymbol + "/m²"]}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke={CHART_COLORS[contract]}
              strokeWidth={2}
              dot={data.length <= 24}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      {cagrPct != null && (
        <div className="mt-3 border-t border-surface-border/40 pt-3 text-xs text-slate-400">
          <span>{market === "cz" ? "Průměrný roční růst" : "Crescita media annua"}: </span>
          <span className={cn("font-semibold", cagrPct >= 0 ? "text-emerald-400" : "text-red-400")}>
            {formatGrowthPct(cagrPct)}
            {market === "cz" ? "/rok" : "/anno"}
          </span>
          {periodLabel ? <span className="text-slate-500"> · {periodLabel}</span> : null}
        </div>
      )}
    </div>
  );
}

export default function MarketPriceCharts({ city, market = "it" }: Props) {
  const [data, setData] = useState<MarketPriceHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheSource, setCacheSource] = useState<"server" | "local" | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!city.trim()) return;

      setLoading(true);
      setError(null);
      setWarning(null);
      try {
        const { data: result, source } = await loadMarketHistoryCacheFirst(city.trim(), refresh, market);
        setData(result);
        setFromCache(source !== "network");
        setCacheSource(source === "network" ? null : source);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Errore caricamento dati mercato";
        try {
          const { data: cached, source } = await loadMarketHistoryCacheFirst(city.trim(), false, market);
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
      setFromCache(false);
      setCacheSource(null);
      return;
    }
    void load(false);
  }, [city, market, load]);

  const regionLabel = market === "cz" ? "Jihomoravský kraj" : (data?.city ?? city);

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
                ? `Storico prezzo medio Kč/m² — ${regionLabel} (Sreality)`
                : `Storico prezzo medio €/m² — ${regionLabel || "seleziona una città"}`}
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
          {data?.mercato_url && (
            <a
              href={data.mercato_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 hover:bg-surface-raised"
            >
              <ExternalLink size={14} />
              {market === "cz" ? "sreality.cz" : "immobiliare.it"}
            </a>
          )}
        </div>
      </div>

      {warning && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {warning}
        </p>
      )}

      {error && !data && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {!data && !loading && !error && (
        <p className="py-8 text-center text-sm text-slate-500">
          {market === "cz"
            ? "Caricamento storico prezzi da Sreality…"
            : "Caricamento dati mercato da cache o immobiliare.it…"}
        </p>
      )}

      {loading && !data ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          <Loader2 size={20} className="mr-2 animate-spin" />
          Caricamento dati mercato…
        </div>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PriceChart title="Vendita" contract="sale" points={data.sale ?? []} market={market} />
          <PriceChart title="Affitto" contract="rent" points={data.rent ?? []} market={market} />
        </div>
      ) : null}

      {data && (
        <p className="mt-4 text-xs text-slate-600">
          {market === "cz" ? (
            <>
              Dati mercato — Sreality.cz (Jihomoravský kraj)
              {fromCache && cacheSource === "server" && ` · cache ${marketCacheFileLabel(city, market)}`}
              {fromCache && cacheSource === "local" && " · cache browser"}
            </>
          ) : (
            <>
              Dati mercato — immobiliare.it
              {data.provider === "insights" ? " (Insights API)" : " (ScrapingBee)"}
              {fromCache && cacheSource === "server" && ` · cache ${marketCacheFileLabel(city, market)}`}
              {fromCache && cacheSource === "local" && " · cache browser"}
            </>
          )}
          {data.fetched_at && ` · ${new Date(data.fetched_at).toLocaleString("it-IT")}`}
        </p>
      )}
    </div>
  );
}
