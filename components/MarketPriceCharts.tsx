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
import { fetchMarketHistory, getCachedMarketHistory } from "@/lib/api";
import type { MarketPriceHistory, PriceHistoryPoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, RefreshCw, TrendingUp } from "lucide-react";

interface Props {
  city: string;
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

export default function MarketPriceCharts({ city }: Props) {
  const [data, setData] = useState<MarketPriceHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!city.trim()) return;
      setLoading(true);
      setError(null);
      try {
        if (!refresh) {
          const cached = await getCachedMarketHistory(city.trim());
          if (cached) {
            setData(cached);
            setFromCache(true);
            return;
          }
        }
        const result = await fetchMarketHistory(city.trim(), refresh);
        setData(result);
        setFromCache(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore caricamento dati mercato");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [city],
  );

  useEffect(() => {
    setData(null);
    setError(null);
    setFromCache(false);
  }, [city]);

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
              Storico prezzo medio €/m² — {city || "seleziona una città"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!data && !loading && (
            <button
              type="button"
              disabled={!city.trim()}
              onClick={() => load(false)}
              className={cn(
                "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500",
                !city.trim() && "cursor-not-allowed opacity-50",
              )}
            >
              Carica dati mercato
            </button>
          )}
          <button
            type="button"
            disabled={loading || !city.trim() || !data}
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
              immobiliare.it
            </a>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {!data && !loading && !error && (
        <p className="py-8 text-center text-sm text-slate-500">
          Clicca &quot;Carica dati mercato&quot; per vedere lo storico prezzi vendita/affitto da immobiliare.it.
        </p>
      )}

      {loading && !data ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          <Loader2 size={20} className="mr-2 animate-spin" />
          Caricamento dati mercato…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <PriceChart title="Vendita" contract="sale" points={data?.sale ?? []} />
          <PriceChart title="Affitto" contract="rent" points={data?.rent ?? []} />
        </div>
      )}

      {data && (
        <p className="mt-4 text-xs text-slate-600">
          Dati mercato — immobiliare.it
          {data.provider === "insights" ? " (Insights API)" : " (ScrapingBee)"}
          {fromCache ? " · da cache" : ""}
          {data.fetched_at && ` · ${new Date(data.fetched_at).toLocaleString("it-IT")}`}
        </p>
      )}
    </div>
  );
}
