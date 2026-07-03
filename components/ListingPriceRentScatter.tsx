"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ListingProfitPreview } from "@/lib/listing-profit-preview";
import { listingConditionLabel } from "@/lib/property-condition";
import {
  profitGradientColor,
  profitRangeFromValues,
  type ProfitGradientRange,
} from "@/lib/profit-gradient";
import type { MapListing } from "@/lib/types";
import { listingsUiLabels, conditionLabelForMarket } from "@/lib/listings-ui-labels";
import type { MarketId } from "@/lib/markets";
import { getMarket } from "@/lib/markets";
import { cn, fmtMoney } from "@/lib/utils";

export interface PriceRentScatterPoint {
  id: string;
  title: string;
  price: number;
  expectedRent: number;
  monthlyNetProfit: number;
  listing: MapListing;
}

interface Props {
  listings: MapListing[];
  profitPreviews: Map<string, ListingProfitPreview>;
  market?: MarketId;
  mapInView?: boolean;
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (listing: MapListing) => void;
  onHover?: (listing: MapListing | null) => void;
  className?: string;
}

const GRID = "#2a3544";
const AXIS = "#64748b";

function axisCompact(value: number, symbol: string): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}k`;
  return `${symbol}${Math.round(value)}`;
}

function logAxisDomain(values: number[]): [number, number] | ["auto", "auto"] {
  const positive = values.filter((v) => v > 0);
  if (!positive.length) return ["auto", "auto"];
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  return [Math.max(min * 0.85, 1), max * 1.08];
}

function buildPoints(
  listings: MapListing[],
  profitPreviews: Map<string, ListingProfitPreview>,
): PriceRentScatterPoint[] {
  return listings
    .filter((l) => l.operation === "sale")
    .map((listing) => {
      const profit = profitPreviews.get(listing.id);
      if (!profit) return null;
      return {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        expectedRent: profit.estimatedMonthlyRent,
        monthlyNetProfit: profit.monthlyNetProfit,
        listing,
      };
    })
    .filter((p): p is PriceRentScatterPoint => p != null);
}

function ScatterDot({
  cx,
  cy,
  payload,
  profitRange,
  selected,
  hovered,
}: {
  cx?: number;
  cy?: number;
  payload?: PriceRentScatterPoint;
  profitRange: ProfitGradientRange;
  selected: boolean;
  hovered: boolean;
}) {
  if (cx == null || cy == null || !payload) return null;
  const fill = profitGradientColor(payload.monthlyNetProfit, profitRange);
  const r = selected ? 7 : hovered ? 6 : 4.5;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      stroke={selected ? "#f8fafc" : hovered ? "#94a3b8" : "transparent"}
      strokeWidth={selected ? 2 : hovered ? 1.5 : 0}
      style={{ cursor: "pointer" }}
    />
  );
}

function ScatterTooltip({
  active,
  payload,
  market = "it",
}: {
  active?: boolean;
  payload?: Array<{ payload: PriceRentScatterPoint }>;
  market?: MarketId;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const ui = listingsUiLabels(market);
  const fmt = (n: number) => fmtMoney(n, market);
  const conditionLabel = conditionLabelForMarket(listingConditionLabel(point.listing), market);
  const needsRenovation = point.listing.needs_renovation === true;
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 max-w-[220px] font-medium text-slate-200 line-clamp-2">{point.title}</p>
      <p className="text-slate-400">
        {market === "cz" ? "Cena" : "Prezzo"}: {fmt(point.price)}
      </p>
      <p className="text-slate-400">
        {ui.estRent}: {fmt(point.expectedRent)}{ui.perMonth}
      </p>
      {conditionLabel && (
        <p className={cn("text-slate-400", needsRenovation && "font-medium text-amber-400")}>
          {ui.condition}: {conditionLabel}
        </p>
      )}
      <p
        className={cn(
          "mt-1 font-medium",
          point.monthlyNetProfit >= 0 ? "text-emerald-400" : "text-red-400",
        )}
      >
        {ui.netProfit}: {fmt(point.monthlyNetProfit)}{ui.perMonth}
      </p>
    </div>
  );
}

export default function ListingPriceRentScatter({
  listings,
  profitPreviews,
  market = "it",
  mapInView = false,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  className,
}: Props) {
  const [logScale, setLogScale] = useState(true);
  const ui = listingsUiLabels(market);
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const rentAxisLabel = market === "cz" ? "Odhad nájmu" : "Affitto stimato";
  const priceAxisLabel = market === "cz" ? "Cena" : "Prezzo";
  const formatAxis = (v: number) => axisCompact(v, currencySymbol);
  const points = useMemo(
    () => buildPoints(listings, profitPreviews),
    [listings, profitPreviews],
  );

  const profitRange = useMemo(
    () => profitRangeFromValues(points.map((p) => p.monthlyNetProfit)),
    [points],
  );

  const xDomain = useMemo(
    () => (logScale ? logAxisDomain(points.map((p) => p.expectedRent)) : (["auto", "auto"] as const)),
    [logScale, points],
  );

  const yDomain = useMemo(
    () => (logScale ? logAxisDomain(points.map((p) => p.price)) : (["auto", "auto"] as const)),
    [logScale, points],
  );

  if (!points.length) {
    return (
      <div
        className={cn(
          "border-t border-surface-border/80 bg-surface-raised/20 px-4 py-6 text-center",
          className,
        )}
      >
        <h3 className="text-sm font-semibold text-slate-200">Prezzo vs affitto stimato</h3>
        <p className="mt-1 text-xs text-slate-500">
          Nessun punto da mostrare
          {mapInView ? " nell'area visibile della mappa" : ""} — servono annunci in vendita e cache
          affitti per la città.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-surface-border/80 bg-surface-raised/20 px-4 py-4", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Prezzo vs affitto stimato</h3>
          <p className="text-[11px] text-slate-500">
            {points.length} annunci{mapInView ? " in vista sulla mappa" : ""} · colore = utile netto
            mensile
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLogScale((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
              logScale
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-surface-border text-slate-400 hover:bg-surface-raised hover:text-slate-200",
            )}
            aria-pressed={logScale}
          >
            Asse log
          </button>
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <span
              className="h-2 w-8 rounded-full"
              style={{
                background: "linear-gradient(90deg, rgb(248 113 113), rgb(251 191 36), rgb(52 211 153))",
              }}
            />
            <span>peggiore → migliore</span>
          </div>
        </div>
      </div>
      <div className="h-[280px] min-h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={280}>
          <ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="expectedRent"
              name="Affitto stim."
              scale={logScale ? "log" : "linear"}
              domain={xDomain}
              allowDataOverflow={logScale}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickFormatter={formatAxis}
              label={{
                value: logScale
                  ? `${rentAxisLabel} (${currencySymbol}${ui.perMonth}, log)`
                  : `${rentAxisLabel} (${currencySymbol}${ui.perMonth})`,
                position: "insideBottom",
                offset: -18,
                fill: AXIS,
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="price"
              name="Prezzo"
              scale={logScale ? "log" : "linear"}
              domain={yDomain}
              allowDataOverflow={logScale}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickFormatter={formatAxis}
              width={56}
              label={{
                value: logScale ? `${priceAxisLabel} (${currencySymbol}, log)` : `${priceAxisLabel} (${currencySymbol})`,
                angle: -90,
                position: "insideLeft",
                fill: AXIS,
                fontSize: 11,
              }}
            />
            <ZAxis range={[64, 64]} />
            <Tooltip
              content={<ScatterTooltip market={market} />}
              cursor={{ strokeDasharray: "3 3", stroke: AXIS }}
            />
            <Scatter
              data={points}
              onClick={(data) => {
                const point = data as PriceRentScatterPoint;
                if (point?.listing) onSelect?.(point.listing);
              }}
              onMouseEnter={(data) => {
                const point = data as PriceRentScatterPoint;
                if (point?.listing) onHover?.(point.listing);
              }}
              onMouseLeave={() => onHover?.(null)}
              shape={(props: { cx?: number; cy?: number; payload?: PriceRentScatterPoint }) => (
                <ScatterDot
                  {...props}
                  profitRange={profitRange}
                  selected={props.payload?.id === selectedId}
                  hovered={props.payload?.id === hoveredId}
                />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { buildPoints };
