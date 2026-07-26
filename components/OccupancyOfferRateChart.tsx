"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MarketId } from "@/lib/markets";
import type { OccupancyOfferBreakdownGroup, OccupancyOfferRatePoint } from "@/lib/types";
import {
  occupancyI18nRoot,
  type OccupancyOperation,
} from "@/lib/occupancy/operation";
import {
  OFFER_BREAKDOWN_GROUPS,
  offerBreakdownField,
  type OfferSeriesMode,
} from "@/lib/occupancy/offer-rate-series";
import { listSegmentBuckets } from "@/lib/occupancy/segment-metrics";
import { CHART_THEME, chartTooltipStyle } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

interface Props {
  series: OccupancyOfferRatePoint[];
  operation?: OccupancyOperation;
  market?: MarketId;
}

type ChartViewMode = "breakdown" | "trend";

const SERIES_COLORS = [
  CHART_THEME.series.blue,
  CHART_THEME.series.amber,
  CHART_THEME.series.violet,
  CHART_THEME.series.cyan,
  CHART_THEME.positive,
  CHART_THEME.series.slate,
  "#db2777",
  "#0d9488",
];

const GROUP_LABEL_KEYS: Record<
  OccupancyOfferBreakdownGroup,
  "segmentsGroupType" | "segmentsGroupSize" | "segmentsGroupRooms" | "segmentsGroupPrice"
> = {
  type: "segmentsGroupType",
  size: "segmentsGroupSize",
  rooms: "segmentsGroupRooms",
  price: "segmentsGroupPrice",
};

function linearTrend(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [values[0]!];
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i]!;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return values.map(() => sumY / n);
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, i) => Math.max(0, Math.round(intercept + slope * i)));
}

function movingAverage(values: number[], window = 3): Array<number | null> {
  return values.map((_, index) => {
    if (index < window - 1) return null;
    const slice = values.slice(index - window + 1, index + 1);
    return Math.round(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  });
}

function OfferTooltip({
  active,
  payload,
  label,
  labels,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string; name?: string }>;
  label?: string;
  labels: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-surface-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-neutral-900">{label}</p>
      <ul className="space-y-1 text-neutral-600">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? "");
          if (entry.value == null) return null;
          return (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: entry.color }}
                />
                {labels[key] ?? entry.name}
              </span>
              <span className="font-medium text-neutral-900">{entry.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BreakdownLineChart({
  series,
  mode,
  activeGroup,
  market,
  operation,
  i18nRoot,
}: {
  series: OccupancyOfferRatePoint[];
  mode: OfferSeriesMode;
  activeGroup: OccupancyOfferBreakdownGroup;
  market: MarketId;
  operation: OccupancyOperation;
  i18nRoot: string;
}) {
  const { t } = useI18n();

  const bucketIds = useMemo(() => {
    const field = offerBreakdownField(activeGroup, mode);
    const known = listSegmentBuckets(activeGroup, market, operation).map((b) => b.id);
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of known) {
      const hasValue = series.some((point) => (point[field][id] ?? 0) > 0);
      if (!hasValue) continue;
      seen.add(id);
      ordered.push(id);
    }
    for (const point of series) {
      for (const [id, value] of Object.entries(point[field])) {
        if (value > 0 && !seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
    return ordered;
  }, [activeGroup, market, mode, operation, series]);

  const chartData = useMemo(() => {
    const field = offerBreakdownField(activeGroup, mode);
    return series.map((point) => {
      const row: Record<string, string | number> = {
        label: point.label,
        fetched_at: point.fetched_at,
      };
      for (const id of bucketIds) {
        row[id] = point[field][id] ?? 0;
      }
      return row;
    });
  }, [series, activeGroup, bucketIds, mode]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const id of bucketIds) {
      map[id] = t(`${i18nRoot}.segments.${activeGroup}.${id}`);
    }
    return map;
  }, [bucketIds, activeGroup, i18nRoot, t]);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_THEME.axis, fontSize: 11 }}
            axisLine={{ stroke: CHART_THEME.grid }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: CHART_THEME.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<OfferTooltip labels={labels} />} contentStyle={chartTooltipStyle} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: CHART_THEME.axis }}
            formatter={(value) => labels[value] ?? value}
          />
          {bucketIds.map((id, index) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={id}
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={1.75}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({
  series,
  mode,
  i18nRoot,
}: {
  series: OccupancyOfferRatePoint[];
  mode: OfferSeriesMode;
  i18nRoot: string;
}) {
  const { t } = useI18n();
  const stroke =
    mode === "new" ? CHART_THEME.series.blue : CHART_THEME.negative;
  const fill =
    mode === "new" ? "rgba(37, 99, 235, 0.12)" : "rgba(220, 38, 38, 0.1)";

  const chartData = useMemo(() => {
    const values = series.map((point) =>
      mode === "new" ? point.new_total : point.removed_total,
    );
    const trend = linearTrend(values);
    const average = movingAverage(values, 3);
    return series.map((point, index) => ({
      label: point.label,
      fetched_at: point.fetched_at,
      value: values[index]!,
      trend: trend[index]!,
      average: average[index],
    }));
  }, [mode, series]);

  const labels = useMemo(
    () => ({
      value: t(`${i18nRoot}.offerRate.seriesValue`),
      trend: t(`${i18nRoot}.offerRate.seriesTrend`),
      average: t(`${i18nRoot}.offerRate.seriesAverage`),
    }),
    [i18nRoot, t],
  );

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_THEME.axis, fontSize: 11 }}
            axisLine={{ stroke: CHART_THEME.grid }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: CHART_THEME.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<OfferTooltip labels={labels} />} contentStyle={chartTooltipStyle} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: CHART_THEME.axis }}
            formatter={(value) => labels[value as keyof typeof labels] ?? value}
          />
          <Area
            type="monotone"
            dataKey="value"
            name="value"
            stroke={stroke}
            fill={fill}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="average"
            name="average"
            stroke={CHART_THEME.series.amber}
            strokeWidth={1.75}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
          />
          <Line
            type="linear"
            dataKey="trend"
            name="trend"
            stroke={CHART_THEME.series.slate}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
  i18nRoot,
}: {
  value: ChartViewMode;
  onChange: (next: ChartViewMode) => void;
  i18nRoot: string;
}) {
  const { t } = useI18n();
  return (
    <div className="inline-flex gap-1 rounded-lg border border-surface-border/60 bg-neutral-50 p-1">
      {(
        [
          ["breakdown", "viewBreakdown"],
          ["trend", "viewTrend"],
        ] as const
      ).map(([id, key]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === id
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-800",
          )}
        >
          {t(`${i18nRoot}.offerRate.${key}`)}
        </button>
      ))}
    </div>
  );
}

function GroupToggle({
  availableGroups,
  activeGroup,
  onChange,
  i18nRoot,
}: {
  availableGroups: OccupancyOfferBreakdownGroup[];
  activeGroup: OccupancyOfferBreakdownGroup;
  onChange: (group: OccupancyOfferBreakdownGroup) => void;
  i18nRoot: string;
}) {
  const { t } = useI18n();
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-surface-border/60 bg-neutral-50 p-1">
      {availableGroups.map((group) => (
        <button
          key={group}
          type="button"
          onClick={() => onChange(group)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            activeGroup === group
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-800",
          )}
        >
          {t(`${i18nRoot}.${GROUP_LABEL_KEYS[group]}`)}
        </button>
      ))}
    </div>
  );
}

function OfferChartCard({
  title,
  subtitle,
  stats,
  series,
  mode,
  availableGroups,
  activeGroup,
  onGroupChange,
  market,
  operation,
  i18nRoot,
}: {
  title: string;
  subtitle: string;
  stats: ReactNode;
  series: OccupancyOfferRatePoint[];
  mode: OfferSeriesMode;
  availableGroups: OccupancyOfferBreakdownGroup[];
  activeGroup: OccupancyOfferBreakdownGroup;
  onGroupChange: (group: OccupancyOfferBreakdownGroup) => void;
  market: MarketId;
  operation: OccupancyOperation;
  i18nRoot: string;
}) {
  const [viewMode, setViewMode] = useState<ChartViewMode>("breakdown");

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-surface-border/60 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle value={viewMode} onChange={setViewMode} i18nRoot={i18nRoot} />
            {viewMode === "breakdown" ? (
              <GroupToggle
                availableGroups={availableGroups}
                activeGroup={activeGroup}
                onChange={onGroupChange}
                i18nRoot={i18nRoot}
              />
            ) : null}
          </div>
        </div>
        {stats}
      </div>
      <div className="px-4 py-5 sm:px-6">
        {viewMode === "breakdown" ? (
          <BreakdownLineChart
            series={series}
            mode={mode}
            activeGroup={activeGroup}
            market={market}
            operation={operation}
            i18nRoot={i18nRoot}
          />
        ) : (
          <TrendChart series={series} mode={mode} i18nRoot={i18nRoot} />
        )}
      </div>
    </div>
  );
}

export default function OccupancyOfferRateChart({
  series,
  operation = "rent",
  market = "it",
}: Props) {
  const { t } = useI18n();
  const i18nRoot = occupancyI18nRoot(operation);
  const [newGroup, setNewGroup] = useState<OccupancyOfferBreakdownGroup>(
    market === "cz" ? "type" : "size",
  );
  const [removedGroup, setRemovedGroup] = useState<OccupancyOfferBreakdownGroup>(
    market === "cz" ? "type" : "size",
  );

  const availableGroups = useMemo(
    () =>
      OFFER_BREAKDOWN_GROUPS.filter((group) => market === "cz" || group !== "type"),
    [market],
  );

  const activeNewGroup = availableGroups.includes(newGroup)
    ? newGroup
    : (availableGroups[0] ?? "size");
  const activeRemovedGroup = availableGroups.includes(removedGroup)
    ? removedGroup
    : (availableGroups[0] ?? "size");

  const totals = useMemo(() => {
    if (!series.length) return null;
    const newTotal = series.reduce((sum, p) => sum + p.new_total, 0);
    const removedTotal = series.reduce((sum, p) => sum + p.removed_total, 0);
    const latest = series[series.length - 1]!;
    return { newTotal, removedTotal, latest };
  }, [series]);

  if (!series.length) {
    return (
      <div className="card overflow-hidden">
        <div className="border-b border-surface-border/60 px-6 py-4">
          <h3 className="text-base font-semibold text-neutral-900">
            {t(`${i18nRoot}.offerRate.title`)}
          </h3>
          <p className="mt-1 text-sm text-neutral-600">{t(`${i18nRoot}.offerRate.subtitle`)}</p>
        </div>
        <p className="px-6 py-10 text-center text-sm text-neutral-500">
          {t(`${i18nRoot}.offerRate.empty`)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfferChartCard
        title={t(`${i18nRoot}.offerRate.title`)}
        subtitle={t(`${i18nRoot}.offerRate.subtitle`)}
        series={series}
        mode="new"
        availableGroups={availableGroups}
        activeGroup={activeNewGroup}
        onGroupChange={setNewGroup}
        market={market}
        operation={operation}
        i18nRoot={i18nRoot}
        stats={
          totals ? (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
              <span>{t(`${i18nRoot}.offerRate.totalNew`, { count: totals.newTotal })}</span>
              <span>
                {t(`${i18nRoot}.offerRate.latestActive`, {
                  count: totals.latest.active_count,
                })}
              </span>
            </div>
          ) : null
        }
      />
      <OfferChartCard
        title={t(`${i18nRoot}.offerRate.removedTitle`)}
        subtitle={t(`${i18nRoot}.offerRate.removedSubtitle`)}
        series={series}
        mode="removed"
        availableGroups={availableGroups}
        activeGroup={activeRemovedGroup}
        onGroupChange={setRemovedGroup}
        market={market}
        operation={operation}
        i18nRoot={i18nRoot}
        stats={
          totals ? (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
              <span>
                {t(`${i18nRoot}.offerRate.totalRemoved`, { count: totals.removedTotal })}
              </span>
            </div>
          ) : null
        }
      />
    </div>
  );
}
