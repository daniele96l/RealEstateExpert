"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OccupancyAreaPreview } from "@/lib/types";
import type { MarketId } from "@/lib/markets";
import { cn, fmtMoney } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

type ChartMode = "rent" | "per_sqm";

function defaultMode(areas: OccupancyAreaPreview[]): ChartMode {
  const withPerSqm = areas.filter((a) => a.avg_price_per_sqm != null && a.avg_price_per_sqm > 0).length;
  const withRent = areas.filter((a) => a.avg_price != null && a.avg_price > 0).length;
  if (withPerSqm > 0 && withPerSqm >= withRent) return "per_sqm";
  return "rent";
}

interface Props {
  areas: OccupancyAreaPreview[];
  perSqmLabel: string;
  market?: MarketId;
  cityAvgRent?: number | null;
  cityAvgPerSqm?: number | null;
}

interface ChartRow {
  zone: string;
  shortZone: string;
  count: number;
  value: number;
  displayValue: string;
  avg_price: number | null;
  avg_price_per_sqm: number | null;
  color: string;
}

function shortenZone(zone: string): string {
  const primary = zone.split(",")[0]?.trim() ?? zone;
  if (primary.length <= 34) return primary;
  return `${primary.slice(0, 31)}…`;
}

function colorForRatio(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = 168 - clamped * 148;
  const lightness = 48 + clamped * 8;
  return `hsl(${hue} 78% ${lightness}%)`;
}

function ChartTooltip({
  active,
  payload,
  perSqmLabel,
  listingsLabel,
  avgRentLabel,
  perSqmFullLabel,
  market,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  perSqmLabel: string;
  market: MarketId;
  listingsLabel: string;
  avgRentLabel: string;
  perSqmFullLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm shadow-xl backdrop-blur-md">
      <p className="max-w-xs font-medium text-neutral-900">{row.zone}</p>
      <p className="mt-2 text-base font-semibold text-neutral-900">{row.displayValue}</p>
      <div className="mt-2 space-y-1 text-xs text-neutral-600">
        <p>
          {listingsLabel}: <span className="text-neutral-800">{row.count}</span>
        </p>
        {row.avg_price != null ? (
          <p>
            {avgRentLabel}: <span className="text-neutral-800">{fmtMoney(row.avg_price, market)}</span>
          </p>
        ) : null}
        {row.avg_price_per_sqm != null ? (
          <p>
            {perSqmFullLabel}:{" "}
            <span className="text-neutral-800">
              {fmtMoney(row.avg_price_per_sqm, market)}
              {perSqmLabel}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function OccupancyAreaPriceChart({
  areas,
  perSqmLabel,
  market = "it",
  cityAvgRent,
  cityAvgPerSqm,
}: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ChartMode>(() => defaultMode(areas));

  useEffect(() => {
    setMode(defaultMode(areas));
  }, [areas]);

  const rows = useMemo(() => {
    const valueKey = mode === "rent" ? "avg_price" : "avg_price_per_sqm";
    const filtered = areas
      .filter((area) => area[valueKey] != null && area[valueKey]! > 0)
      .sort((a, b) => (b[valueKey] ?? 0) - (a[valueKey] ?? 0));

    if (!filtered.length) return [];

    const values = filtered.map((area) => area[valueKey]!);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    return filtered.map((area) => {
      const value = area[valueKey]!;
      const ratio = (value - min) / span;
      const displayValue =
        mode === "rent" ? fmtMoney(value, market) : `${fmtMoney(value, market)}${perSqmLabel}`;

      return {
        zone: area.zone,
        shortZone: shortenZone(area.zone),
        count: area.count,
        value,
        displayValue,
        avg_price: area.avg_price,
        avg_price_per_sqm: area.avg_price_per_sqm,
        color: colorForRatio(ratio),
      };
    });
  }, [areas, mode, perSqmLabel, market]);

  const chartHeight = Math.max(260, rows.length * 42 + 48);
  const resolvedCityAvg = mode === "rent" ? cityAvgRent : cityAvgPerSqm;

  if (!rows.length) {
    return (
      <div className="flex h-40 items-center justify-center px-6 text-sm text-neutral-500">
        {t("occupancy.areaChart.empty")}
      </div>
    );
  }

  const cheapest = rows[rows.length - 1];
  const priciest = rows[0];

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-neutral-900">{t("occupancy.areaChart.title")}</h3>
          <p className="mt-1 text-sm text-neutral-600">{t("occupancy.areaChart.subtitle")}</p>
        </div>
        <div className="inline-flex rounded-lg border border-surface-border/60 bg-neutral-50 p-1">
          <button
            type="button"
            onClick={() => setMode("per_sqm")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "per_sqm"
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-800",
            )}
          >
            {t("occupancy.areaChart.modePerSqm")}
          </button>
          <button
            type="button"
            onClick={() => setMode("rent")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "rent"
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-800",
            )}
          >
            {t("occupancy.areaChart.modeRent")}
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-green-700/80">
            {t("occupancy.areaChart.cheapest")}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-neutral-800">{cheapest?.shortZone}</p>
          <p className="mt-0.5 text-lg font-bold text-green-700">{cheapest?.displayValue}</p>
        </div>
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-sky-300/80">
            {t("occupancy.areaChart.cityAvg")}
          </p>
          <p className="mt-1 text-sm text-neutral-600">{t("occupancy.areaChart.allAreas")}</p>
          <p className="mt-0.5 text-lg font-bold text-sky-300">
            {resolvedCityAvg != null
              ? mode === "rent"
                ? fmtMoney(resolvedCityAvg, market)
                : `${fmtMoney(resolvedCityAvg, market)}${perSqmLabel}`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-rose-300/80">
            {t("occupancy.areaChart.priciest")}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-neutral-800">{priciest?.shortZone}</p>
          <p className="mt-0.5 text-lg font-bold text-rose-300">{priciest?.displayValue}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <span>{t("occupancy.areaChart.scaleLow")}</span>
        <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-rose-400" />
        <span>{t("occupancy.areaChart.scaleHigh")}</span>
      </div>

      <div className="mt-3" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 72, left: 4, bottom: 4 }}
            barCategoryGap="18%"
          >
            <CartesianGrid stroke="#2a3544" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="shortZone"
              width={148}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            {resolvedCityAvg != null && resolvedCityAvg > 0 ? (
              <ReferenceLine
                x={resolvedCityAvg}
                stroke="#64748b"
                strokeDasharray="5 5"
                strokeWidth={1.5}
              />
            ) : null}
            <Tooltip
              cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
              content={
                <ChartTooltip
                  perSqmLabel={perSqmLabel}
                  market={market}
                  listingsLabel={t("occupancy.areaChart.listings")}
                  avgRentLabel={t("occupancy.table.avgRent")}
                  perSqmFullLabel={t("occupancy.table.avgRentPerSqm")}
                />
              }
            />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={22}>
              {rows.map((row) => (
                <Cell key={row.zone} fill={row.color} />
              ))}
              <LabelList
                dataKey="displayValue"
                position="right"
                fill="#e2e8f0"
                fontSize={11}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
