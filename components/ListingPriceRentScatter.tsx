"use client";

import { memo, useCallback, useMemo, useState } from "react";
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
import { listingRenovationCost } from "@/lib/constants";
import type { ListingProfitPreview } from "@/lib/listing-profit-preview";
import { listingConditionLabel } from "@/lib/property-condition";
import {
  profitGradientColor,
  profitRangeFromValues,
} from "@/lib/profit-gradient";
import type { MapListing } from "@/lib/types";
import { listingsUiLabels, conditionLabelForMarket, type ListingsUiLabels } from "@/lib/listings-ui-labels";
import { useI18n } from "@/lib/i18n/context";
import type { MarketId } from "@/lib/markets";
import { getMarket } from "@/lib/markets";
import { cn, fmtMoney } from "@/lib/utils";

export interface PriceRentScatterPoint {
  id: string;
  title: string;
  /** Y-axis value (listing price, optionally + renovation). */
  price: number;
  listingPrice: number;
  renovationCost: number;
  expectedRent: number;
  monthlyNetProfit: number;
  fill: string;
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
const MAX_SCATTER_POINTS = 200;

function downsamplePoints<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  return Array.from({ length: max }, (_, i) =>
    points[Math.min(Math.floor(i * step), points.length - 1)],
  );
}

function axisCompact(value: number, symbol: string): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}k`;
  return `${symbol}${Math.round(value)}`;
}

function logAxisDomain(values: number[]): [number, number] | string[] {
  const positive = values.filter((v) => v > 0);
  if (!positive.length) return ["auto", "auto"];
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  return [Math.max(min * 0.85, 1), max * 1.08];
}

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Log-space IQR fence — works well for skewed price/rent distributions. */
function iqrFence(values: number[], multiplier = 1.5): [number, number] | null {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length < 4) return null;
  const logs = positive.map(Math.log).sort((a, b) => a - b);
  const q1 = quantile(logs, 0.25);
  const q3 = quantile(logs, 0.75);
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr <= 0) return null;
  return [Math.exp(q1 - multiplier * iqr), Math.exp(q3 + multiplier * iqr)];
}

type RawScatterPoint = Omit<PriceRentScatterPoint, "fill">;

function excludeScatterOutliers(points: RawScatterPoint[]): {
  filtered: RawScatterPoint[];
  excludedCount: number;
} {
  if (points.length < 4) return { filtered: points, excludedCount: 0 };

  const priceFence = iqrFence(points.map((p) => p.price));
  const rentFence = iqrFence(points.map((p) => p.expectedRent));

  const filtered = points.filter((point) => {
    if (priceFence && (point.price < priceFence[0] || point.price > priceFence[1])) return false;
    if (rentFence && (point.expectedRent < rentFence[0] || point.expectedRent > rentFence[1])) {
      return false;
    }
    return true;
  });

  if (!filtered.length) return { filtered: points, excludedCount: 0 };
  return { filtered, excludedCount: points.length - filtered.length };
}

function addFillColors(raw: RawScatterPoint[]): PriceRentScatterPoint[] {
  const profitRange = profitRangeFromValues(raw.map((p) => p.monthlyNetProfit));
  return raw.map((point) => ({
    ...point,
    fill: profitGradientColor(point.monthlyNetProfit, profitRange),
  }));
}

function buildRawPoints(
  listings: MapListing[],
  profitPreviews: Map<string, ListingProfitPreview>,
  includeRenovationCost: boolean,
): RawScatterPoint[] {
  return listings
    .filter((l) => l.operation === "sale")
    .map((listing) => {
      const profit = profitPreviews.get(listing.id);
      if (!profit) return null;
      const renovationCost =
        listingRenovationCost(listing.needs_renovation, listing.sqm, listing.price) ?? 0;
      const listingPrice = listing.price;
      return {
        id: listing.id,
        title: listing.title,
        price: includeRenovationCost ? listingPrice + renovationCost : listingPrice,
        listingPrice,
        renovationCost,
        expectedRent: profit.estimatedMonthlyRent,
        monthlyNetProfit: profit.monthlyNetProfit,
        listing,
      };
    })
    .filter((p): p is RawScatterPoint => p != null);
}

function buildPoints(
  listings: MapListing[],
  profitPreviews: Map<string, ListingProfitPreview>,
  includeRenovationCost = false,
): PriceRentScatterPoint[] {
  return addFillColors(buildRawPoints(listings, profitPreviews, includeRenovationCost));
}

const ScatterDot = memo(function ScatterDot({
  cx,
  cy,
  payload,
  selected,
  hovered,
}: {
  cx?: number;
  cy?: number;
  payload?: PriceRentScatterPoint;
  selected: boolean;
  hovered: boolean;
}) {
  if (cx == null || cy == null || !payload) return null;
  const r = selected ? 7 : hovered ? 6 : 4.5;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={payload.fill}
      stroke={selected ? "#f8fafc" : hovered ? "#94a3b8" : "transparent"}
      strokeWidth={selected ? 2 : hovered ? 1.5 : 0}
      style={{ cursor: "pointer" }}
    />
  );
});

function ScatterTooltip({
  active,
  payload,
  market = "it",
  ui,
  includeRenovationCost = false,
}: {
  active?: boolean;
  payload?: Array<{ payload: PriceRentScatterPoint }>;
  market?: MarketId;
  ui: ListingsUiLabels;
  includeRenovationCost?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const fmt = (n: number) => fmtMoney(n, market);
  const conditionLabel = conditionLabelForMarket(listingConditionLabel(point.listing), market);
  const needsRenovation = point.listing.needs_renovation === true;
  const priceLabel = market === "cz" ? "Cena" : "Prezzo";
  return (
    <div className="rounded-lg border border-surface-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 max-w-[220px] font-medium text-neutral-800 line-clamp-2">{point.title}</p>
      {includeRenovationCost && point.renovationCost > 0 ? (
        <>
          <p className="text-neutral-600">
            {ui.listingPrice}: {fmt(point.listingPrice)}
          </p>
          <p className="text-amber-400/90">
            {ui.renovationEstimate}: {fmt(point.renovationCost)}
          </p>
          <p className="font-medium text-neutral-700">
            {ui.pricePlusRenovation}: {fmt(point.price)}
          </p>
        </>
      ) : (
        <p className="text-neutral-600">
          {priceLabel}: {fmt(point.price)}
        </p>
      )}
      <p className="text-neutral-600">
        {ui.estRent}: {fmt(point.expectedRent)}{ui.perMonth}
      </p>
      {conditionLabel && (
        <p className={cn("text-neutral-600", needsRenovation && "font-medium text-amber-400")}>
          {ui.condition}: {conditionLabel}
        </p>
      )}
      <p
        className={cn(
          "mt-1 font-medium",
          point.monthlyNetProfit >= 0 ? "text-green-600" : "text-red-400",
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
  const { t } = useI18n();
  const [logScale, setLogScale] = useState(true);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const includeRenovationCost = true;
  const [localHoveredId, setLocalHoveredId] = useState<string | null>(null);
  const ui = listingsUiLabels(market, t);
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const rentAxisLabel = market === "cz" ? "Odhad nájmu" : "Affitto stimato";
  const priceAxisLabel = ui.pricePlusRenovation;
  const formatAxis = useCallback(
    (v: number) => axisCompact(v, currencySymbol),
    [currencySymbol],
  );
  const { chartPoints, outlierCount, totalPointCount } = useMemo(() => {
    const raw = buildRawPoints(listings, profitPreviews, includeRenovationCost);
    const { filtered, excludedCount } = excludeScatterOutliers(raw);
    const visible = filtered.length > 0 ? filtered : raw;
    return {
      chartPoints: addFillColors(visible),
      outlierCount: filtered.length > 0 ? excludedCount : 0,
      totalPointCount: raw.length,
    };
  }, [listings, profitPreviews, includeRenovationCost]);
  const points = useMemo(
    () => (showAllPoints ? chartPoints : downsamplePoints(chartPoints, MAX_SCATTER_POINTS)),
    [chartPoints, showAllPoints],
  );
  const sampledCount = showAllPoints ? 0 : Math.max(0, chartPoints.length - points.length);
  const activeHoveredId = hoveredId ?? localHoveredId;

  const xDomain = useMemo(
    () => (logScale ? logAxisDomain(points.map((p) => p.expectedRent)) : ["auto", "auto"]),
    [logScale, points],
  );

  const yDomain = useMemo(
    () => (logScale ? logAxisDomain(points.map((p) => p.price)) : ["auto", "auto"]),
    [logScale, points],
  );

  const renderDot = useCallback(
    (props: { cx?: number; cy?: number; payload?: PriceRentScatterPoint }) => (
      <ScatterDot
        {...props}
        selected={props.payload?.id === selectedId}
        hovered={props.payload?.id === activeHoveredId}
      />
    ),
    [selectedId, activeHoveredId],
  );

  const handleScatterClick = useCallback(
    (data: unknown) => {
      const point = data as PriceRentScatterPoint;
      if (point?.listing) onSelect?.(point.listing);
    },
    [onSelect],
  );

  const handleScatterEnter = useCallback((data: unknown) => {
    const point = data as PriceRentScatterPoint;
    if (point?.id) setLocalHoveredId(point.id);
  }, []);

  const handleScatterLeave = useCallback(() => {
    setLocalHoveredId(null);
  }, []);

  if (!totalPointCount) {
    return (
      <div
        className={cn(
          "border-t border-surface-border bg-neutral-50 px-4 py-6 text-center",
          className,
        )}
      >
        <h3 className="text-sm font-semibold text-neutral-800">Prezzo vs affitto stimato</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Nessun punto da mostrare
          {mapInView ? " nell'area visibile della mappa" : ""} — servono annunci in vendita e cache
          affitti per la città.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-surface-border bg-neutral-50 px-4 py-4", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">Prezzo vs affitto stimato</h3>
          <p className="text-[11px] text-neutral-500">
            {totalPointCount} annunci{mapInView ? " in vista sulla mappa" : ""}
            {outlierCount > 0 ? ` · ${outlierCount} outlier esclusi` : ""}
            {!showAllPoints && sampledCount > 0 ? ` · grafico su ${points.length} campioni` : ""}
            {showAllPoints && points.length > 0 ? ` · ${points.length} punti nel grafico` : ""}
            {" · colore = utile netto mensile"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAllPoints((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
              showAllPoints
                ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                : "border-surface-border text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800",
            )}
            aria-pressed={showAllPoints}
            title="Mostra ogni annuncio — può rallentare il browser"
          >
            Tutti i punti
          </button>
          <button
            type="button"
            onClick={() => setLogScale((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
              logScale
                ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                : "border-surface-border text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800",
            )}
            aria-pressed={logScale}
          >
            Asse log
          </button>
          <div className="flex items-center gap-1 text-[10px] text-neutral-500">
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
        <ResponsiveContainer width="100%" height={280} debounce={150}>
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
              content={
                <ScatterTooltip
                  market={market}
                  ui={ui}
                  includeRenovationCost={includeRenovationCost}
                />
              }
              cursor={{ strokeDasharray: "3 3", stroke: AXIS }}
              isAnimationActive={false}
            />
            <Scatter
              data={points}
              isAnimationActive={false}
              onClick={handleScatterClick}
              onMouseEnter={handleScatterEnter}
              onMouseLeave={handleScatterLeave}
              shape={renderDot}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { buildPoints };
