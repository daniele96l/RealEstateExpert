"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OccupancyOfferRatePoint } from "@/lib/types";
import {
  occupancyI18nRoot,
  type OccupancyOperation,
} from "@/lib/occupancy/operation";
import { CHART_THEME, chartTooltipStyle } from "@/lib/chart-theme";
import { useI18n } from "@/lib/i18n/context";

interface Props {
  series: OccupancyOfferRatePoint[];
  operation?: OccupancyOperation;
  showRoomSeries?: boolean;
}

const COLORS = {
  total: CHART_THEME.primary,
  flat: CHART_THEME.series.blue,
  room: CHART_THEME.series.amber,
  other: CHART_THEME.series.violet,
  removed: CHART_THEME.negative,
};

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
          return (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: entry.color }}
                />
                {labels[key] ?? entry.name}
              </span>
              <span className="font-medium text-neutral-900">{entry.value ?? 0}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function OccupancyOfferRateChart({
  series,
  operation = "rent",
  showRoomSeries = true,
}: Props) {
  const { t } = useI18n();
  const i18nRoot = occupancyI18nRoot(operation);

  const hasRooms = useMemo(
    () => showRoomSeries && series.some((point) => point.new_room > 0),
    [series, showRoomSeries],
  );
  const hasOther = useMemo(() => series.some((point) => point.new_other > 0), [series]);

  const totals = useMemo(() => {
    if (!series.length) return null;
    const newTotal = series.reduce((sum, p) => sum + p.new_total, 0);
    const removedTotal = series.reduce((sum, p) => sum + p.removed_total, 0);
    const latest = series[series.length - 1]!;
    return { newTotal, removedTotal, latest };
  }, [series]);

  const labels = {
    new_total: t(`${i18nRoot}.offerRate.seriesTotal`),
    new_flat: t(`${i18nRoot}.offerRate.seriesFlat`),
    new_room: t(`${i18nRoot}.offerRate.seriesRoom`),
    new_other: t(`${i18nRoot}.offerRate.seriesOther`),
    removed_total: t(`${i18nRoot}.offerRate.seriesRemoved`),
  };

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-surface-border/60 px-6 py-4">
        <h3 className="text-base font-semibold text-neutral-900">
          {t(`${i18nRoot}.offerRate.title`)}
        </h3>
        <p className="mt-1 text-sm text-neutral-600">{t(`${i18nRoot}.offerRate.subtitle`)}</p>
        {totals ? (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
            <span>
              {t(`${i18nRoot}.offerRate.totalNew`, { count: totals.newTotal })}
            </span>
            <span>
              {t(`${i18nRoot}.offerRate.totalRemoved`, { count: totals.removedTotal })}
            </span>
            <span>
              {t(`${i18nRoot}.offerRate.latestActive`, {
                count: totals.latest.active_count,
              })}
            </span>
          </div>
        ) : null}
      </div>

      {!series.length ? (
        <p className="px-6 py-10 text-center text-sm text-neutral-500">
          {t(`${i18nRoot}.offerRate.empty`)}
        </p>
      ) : (
        <div className="px-4 py-5 sm:px-6">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                <Tooltip
                  content={<OfferTooltip labels={labels} />}
                  contentStyle={chartTooltipStyle}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: CHART_THEME.axis }}
                  formatter={(value) => labels[value] ?? value}
                />
                <Line
                  type="monotone"
                  dataKey="new_total"
                  name="new_total"
                  stroke={COLORS.total}
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="new_flat"
                  name="new_flat"
                  stroke={COLORS.flat}
                  strokeWidth={1.75}
                  dot={false}
                />
                {hasRooms ? (
                  <Line
                    type="monotone"
                    dataKey="new_room"
                    name="new_room"
                    stroke={COLORS.room}
                    strokeWidth={1.75}
                    dot={false}
                  />
                ) : null}
                {hasOther ? (
                  <Line
                    type="monotone"
                    dataKey="new_other"
                    name="new_other"
                    stroke={COLORS.other}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="removed_total"
                  name="removed_total"
                  stroke={COLORS.removed}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
