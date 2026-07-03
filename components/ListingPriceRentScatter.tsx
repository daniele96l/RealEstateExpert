"use client";

import { useMemo } from "react";
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
import {
  profitGradientColor,
  profitRangeFromValues,
  type ProfitGradientRange,
} from "@/lib/profit-gradient";
import type { MapListing } from "@/lib/types";
import { fmtEuro } from "@/lib/utils";
import { cn } from "@/lib/utils";

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
  mapInView?: boolean;
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (listing: MapListing) => void;
  onHover?: (listing: MapListing | null) => void;
  className?: string;
}

const GRID = "#2a3544";
const AXIS = "#64748b";

function axisEuro(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
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
}: {
  active?: boolean;
  payload?: Array<{ payload: PriceRentScatterPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 max-w-[220px] font-medium text-slate-200 line-clamp-2">{point.title}</p>
      <p className="text-slate-400">Prezzo: {fmtEuro(point.price)}</p>
      <p className="text-slate-400">Affitto stim.: {fmtEuro(point.expectedRent)}/mese</p>
      <p
        className={cn(
          "mt-1 font-medium",
          point.monthlyNetProfit >= 0 ? "text-emerald-400" : "text-red-400",
        )}
      >
        Utile netto: {fmtEuro(point.monthlyNetProfit)}/mese
      </p>
    </div>
  );
}

export default function ListingPriceRentScatter({
  listings,
  profitPreviews,
  mapInView = false,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  className,
}: Props) {
  const points = useMemo(
    () => buildPoints(listings, profitPreviews),
    [listings, profitPreviews],
  );

  const profitRange = useMemo(
    () => profitRangeFromValues(points.map((p) => p.monthlyNetProfit)),
    [points],
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
      <div className="h-[280px] min-h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={280}>
          <ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="expectedRent"
              name="Affitto stim."
              domain={["auto", "auto"]}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickFormatter={axisEuro}
              label={{
                value: "Affitto stimato (€/mese)",
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
              domain={["auto", "auto"]}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickFormatter={axisEuro}
              width={48}
              label={{
                value: "Prezzo (€)",
                angle: -90,
                position: "insideLeft",
                fill: AXIS,
                fontSize: 11,
              }}
            />
            <ZAxis range={[64, 64]} />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3", stroke: AXIS }} />
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
              shape={(props) => (
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
