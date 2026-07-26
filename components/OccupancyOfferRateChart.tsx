"use client";

import { useMemo, type ReactNode } from "react";
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
import type { MarketId } from "@/lib/markets";
import type { OccupancyOfferRatePoint } from "@/lib/types";
import {
  occupancyI18nRoot,
  type OccupancyOperation,
} from "@/lib/occupancy/operation";
import { CHART_THEME, chartTooltipStyle } from "@/lib/chart-theme";
import { fmtMoney } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

interface Props {
  series: OccupancyOfferRatePoint[];
  operation?: OccupancyOperation;
  market?: MarketId;
}

function OfferTooltip({
  active,
  payload,
  label,
  labels,
  formatValue,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string; name?: string }>;
  label?: string;
  labels: Record<string, string>;
  formatValue?: (value: number) => string;
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
              <span className="font-medium text-neutral-900">
                {formatValue ? formatValue(entry.value) : entry.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SimpleLineCard({
  title,
  subtitle,
  stats,
  data,
  lines,
  labels,
  yWidth = 40,
  formatValue,
  formatTick,
}: {
  title: string;
  subtitle: string;
  stats?: ReactNode;
  data: Array<Record<string, string | number | null>>;
  lines: Array<{ key: string; color: string; dashed?: boolean }>;
  labels: Record<string, string>;
  yWidth?: number;
  formatValue?: (value: number) => string;
  formatTick?: (value: number) => string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-surface-border/60 px-6 py-4">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
        {stats}
      </div>
      <div className="px-4 py-5 sm:px-6">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                width={yWidth}
                tickFormatter={formatTick}
              />
              <Tooltip
                content={<OfferTooltip labels={labels} formatValue={formatValue} />}
                contentStyle={chartTooltipStyle}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: CHART_THEME.axis }}
                formatter={(value) => labels[value] ?? value}
              />
              {lines.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.key}
                  stroke={line.color}
                  strokeWidth={2}
                  strokeDasharray={line.dashed ? "5 4" : undefined}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
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
  const perSqmLabel = t("listings.perSqm");
  const formatPpsqm = (value: number) => `${fmtMoney(value, market)}${perSqmLabel}`;

  const totals = useMemo(() => {
    if (!series.length) return null;
    const latest = series[series.length - 1]!;
    return {
      newTotal: series.reduce((sum, p) => sum + p.new_total, 0),
      removedTotal: series.reduce((sum, p) => sum + p.removed_total, 0),
      latest,
    };
  }, [series]);

  const chartData = useMemo(
    () =>
      series.map((point) => ({
        label: point.label,
        active: point.active_count,
        new: point.new_total,
        removed: point.removed_total,
        newPpsqm: point.new_avg_ppsqm,
        removedPpsqm: point.removed_avg_ppsqm,
      })),
    [series],
  );

  if (!series.length) {
    return (
      <div className="card overflow-hidden">
        <div className="border-b border-surface-border/60 px-6 py-4">
          <h3 className="text-base font-semibold text-neutral-900">
            {t(`${i18nRoot}.offerRate.inventoryTitle`)}
          </h3>
          <p className="mt-1 text-sm text-neutral-600">
            {t(`${i18nRoot}.offerRate.inventorySubtitle`)}
          </p>
        </div>
        <p className="px-6 py-10 text-center text-sm text-neutral-500">
          {t(`${i18nRoot}.offerRate.empty`)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SimpleLineCard
        title={t(`${i18nRoot}.offerRate.inventoryTitle`)}
        subtitle={t(`${i18nRoot}.offerRate.inventorySubtitle`)}
        data={chartData}
        lines={[{ key: "active", color: CHART_THEME.primary }]}
        labels={{ active: t(`${i18nRoot}.offerRate.seriesInventory`) }}
        stats={
          totals ? (
            <div className="mt-3 text-xs text-neutral-500">
              {t(`${i18nRoot}.offerRate.latestActive`, {
                count: totals.latest.active_count,
              })}
            </div>
          ) : null
        }
      />

      <SimpleLineCard
        title={t(`${i18nRoot}.offerRate.flowTitle`)}
        subtitle={t(`${i18nRoot}.offerRate.flowSubtitle`)}
        data={chartData}
        lines={[
          { key: "new", color: CHART_THEME.series.blue },
          { key: "removed", color: CHART_THEME.negative, dashed: true },
        ]}
        labels={{
          new: t(`${i18nRoot}.offerRate.seriesNew`),
          removed: t(`${i18nRoot}.offerRate.seriesRemoved`),
        }}
        stats={
          totals ? (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
              <span>{t(`${i18nRoot}.offerRate.totalNew`, { count: totals.newTotal })}</span>
              <span>
                {t(`${i18nRoot}.offerRate.totalRemoved`, { count: totals.removedTotal })}
              </span>
            </div>
          ) : null
        }
      />

      <SimpleLineCard
        title={t(`${i18nRoot}.offerRate.ppsqmTitle`)}
        subtitle={t(`${i18nRoot}.offerRate.ppsqmSubtitle`)}
        data={chartData}
        lines={[
          { key: "newPpsqm", color: CHART_THEME.series.blue },
          { key: "removedPpsqm", color: CHART_THEME.negative, dashed: true },
        ]}
        labels={{
          newPpsqm: t(`${i18nRoot}.offerRate.seriesNewPpsqm`),
          removedPpsqm: t(`${i18nRoot}.offerRate.seriesRemovedPpsqm`),
        }}
        yWidth={52}
        formatValue={formatPpsqm}
        formatTick={(value) => formatPpsqm(value).replace(/\s/g, "")}
        stats={
          totals ? (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
              {totals.latest.new_avg_ppsqm != null ? (
                <span>
                  {t(`${i18nRoot}.offerRate.latestNewPpsqm`, {
                    value: formatPpsqm(totals.latest.new_avg_ppsqm),
                  })}
                </span>
              ) : null}
              {totals.latest.removed_avg_ppsqm != null ? (
                <span>
                  {t(`${i18nRoot}.offerRate.latestRemovedPpsqm`, {
                    value: formatPpsqm(totals.latest.removed_avg_ppsqm),
                  })}
                </span>
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}
