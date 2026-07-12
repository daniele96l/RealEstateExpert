"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AnalysisResult, MonthlyCashFlowPoint } from "@/lib/types";
import { cn, fmtMoney } from "@/lib/utils";
import { getMarket, type MarketId } from "@/lib/markets";
import { useI18n, type TFunction } from "@/lib/i18n/context";
import { CHART_THEME } from "@/lib/chart-theme";

interface Props {
  result: AnalysisResult;
  market?: MarketId;
}

function legendLabel(primary: string, secondary?: string) {
  return secondary ? `${primary} (${secondary})` : primary;
}

const COLORS = {
  affitto: CHART_THEME.positive,
  mutuo: CHART_THEME.series.violet,
  imposte: CHART_THEME.series.amber,
  grid: CHART_THEME.grid,
  axis: CHART_THEME.axis,
};

const OPEX_BAR_DEFS = [
  { key: "imu", color: "#ef4444" },
  { key: "tari", color: "#f97316" },
  { key: "condominio", color: "#eab308" },
  { key: "agency_fee", color: "#a855f7" },
  { key: "insurance", color: "#84cc16" },
  { key: "maintenance", color: "#22d3ee" },
  { key: "utilities", color: "#38bdf8" },
  { key: "platform_fee", color: "#c084fc" },
] as const;

type OpexKey = (typeof OPEX_BAR_DEFS)[number]["key"];

function monthlyLabels(market: MarketId, t: TFunction) {
  const isCz = market === "cz";
  return {
    rent: t("common.rent"),
    rentIt: undefined as string | undefined,
    mortgage: t("common.mortgage"),
    mortgageIt: undefined as string | undefined,
    net: t("common.net"),
    netIt: undefined as string | undefined,
    perMonth: t("common.perMonth"),
    perYear: t("common.perYear"),
    title: t("monthly.title"),
    titleIt: undefined as string | undefined,
    subtitle: isCz ? t("monthly.subtitleCz") : t("monthly.subtitleIt"),
    subtitleIt: undefined as string | undefined,
    tax: isCz ? t("monthly.incomeTaxCz") : t("monthly.flatTax"),
    taxIt: undefined as string | undefined,
    mortgageOn: (amount: string) => t("monthly.mortgageOn", { amount }),
    mortgageOnIt: undefined as ((amount: string) => string) | undefined,
    yearTotal: (year: number, months: number) => t("monthly.yearTotal", { year, months }),
    yearTotalIt: undefined as ((year: number, months: number) => string) | undefined,
    tooltipMonth: (month: number, year: number) => t("monthly.tooltipMonth", { month, year }),
    yearButton: (y: number) => t("monthly.yearButton", { year: y }),
    opexNames: {
      imu: t("monthly.opex.imu"),
      tari: t(isCz ? "monthly.opex.tariCz" : "monthly.opex.tari"),
      condominio: t(isCz ? "monthly.opex.condominioCz" : "monthly.opex.condominio"),
      agency_fee: t(isCz ? "monthly.opex.agencyFeeCz" : "monthly.opex.agencyFee"),
      insurance: t(isCz ? "monthly.opex.insuranceCz" : "monthly.opex.insurance"),
      maintenance: t(isCz ? "monthly.opex.maintenanceCz" : "monthly.opex.maintenance"),
      utilities: t(isCz ? "monthly.opex.utilitiesCz" : "monthly.opex.utilities"),
      platform_fee: t(isCz ? "monthly.opex.platformCz" : "monthly.opex.platform"),
    } satisfies Record<OpexKey, string>,
    opexIt: undefined as Record<OpexKey, string> | undefined,
  };
}

function opexBarsForMarket(market: MarketId, t: TFunction) {
  const lbl = monthlyLabels(market, t);
  const bars = OPEX_BAR_DEFS.map((b) => ({
    ...b,
    name: lbl.opexNames[b.key],
    nameIt: lbl.opexIt?.[b.key],
  }));
  return market === "cz" ? bars.filter((b) => b.key !== "imu") : bars;
}

function pointToRow(p: MonthlyCashFlowPoint, label: string) {
  return {
    label,
    month: p.month,
    affitto: p.gross_rent,
    mutuo: p.mortgage_payment,
    imposte: p.rental_tax,
    imu: p.imu,
    tari: p.tari,
    condominio: p.condominio,
    insurance: p.insurance,
    maintenance: p.maintenance,
    utilities: p.utilities,
    agency_fee: p.agency_fee,
    platform_fee: p.platform_fee,
    netto: p.net_cash_flow,
  };
}

function yearTotal(points: MonthlyCashFlowPoint[], key: OpexKey): number {
  return points.reduce((s, p) => s + p[key], 0);
}

export default function MonthlyBreakdownChart({ result, market = "it" }: Props) {
  const { t } = useI18n();
  const [year, setYear] = useState(1);
  const labels = useMemo(() => monthlyLabels(market, t), [market, t]);
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const opexBars = useMemo(() => opexBarsForMarket(market, t), [market, t]);

  const years = useMemo(
    () => [...new Set(result.monthly_series.map((p) => p.year))].sort((a, b) => a - b),
    [result.monthly_series],
  );

  const yearPoints = useMemo(
    () => result.monthly_series.filter((p) => p.year === year),
    [result.monthly_series, year],
  );

  const activeOpex = useMemo(
    () => opexBars.filter((b) => yearTotal(yearPoints, b.key) > 0),
    [yearPoints, opexBars],
  );

  const data = useMemo(
    () =>
      yearPoints.map((p) => pointToRow(p, `M${((p.month - 1) % 12) + 1}`)),
    [yearPoints],
  );

  const totals = useMemo(() => {
    if (!data.length) return null;
    const base = data.reduce(
      (acc, d) => ({
        affitto: acc.affitto + d.affitto,
        mutuo: acc.mutuo + d.mutuo,
        imposte: acc.imposte + d.imposte,
        netto: acc.netto + d.netto,
      }),
      { affitto: 0, mutuo: 0, imposte: 0, netto: 0 },
    );
    const opex = Object.fromEntries(
      opexBars.map((b) => [b.key, data.reduce((s, d) => s + d[b.key], 0)]),
    ) as Record<OpexKey, number>;
    return { ...base, opex, months: data.length };
  }, [data, opexBars]);

  const breakdownRows = useMemo(() => {
    if (!totals) return [];
    return [
      { label: labels.rent, labelIt: labels.rentIt, yearly: totals.affitto, color: COLORS.affitto },
      { label: labels.mortgage, labelIt: labels.mortgageIt, yearly: totals.mutuo, color: COLORS.mutuo },
      { label: labels.tax, labelIt: labels.taxIt, yearly: totals.imposte, color: COLORS.imposte },
      ...activeOpex.map((b) => ({
        label: b.name,
        labelIt: b.nameIt,
        yearly: totals.opex[b.key],
        color: b.color,
      })),
    ];
  }, [totals, activeOpex, labels]);

  const netRow = useMemo(() => {
    if (!totals) return null;
    return {
      label: labels.net,
      labelIt: labels.netIt,
      yearly: totals.netto,
      color: totals.netto >= 0 ? COLORS.affitto : "#f87171",
    };
  }, [totals, labels]);

  return (
    <div className="card p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{labels.title}</h2>
          {labels.titleIt && <p className="text-xs text-neutral-500">{labels.titleIt}</p>}
          <p className="text-sm text-neutral-500">{labels.subtitle}</p>
          {labels.subtitleIt && <p className="text-xs text-neutral-500">{labels.subtitleIt}</p>}
          <p className="mt-1 text-xs text-neutral-500">
            {labels.mortgageOn(fmtMoney(result.summary.loan_amount, market))}
          </p>
          {labels.mortgageOnIt && (
            <p className="text-[10px] text-neutral-500">
              {labels.mortgageOnIt(fmtMoney(result.summary.loan_amount, market))}
            </p>
          )}
        </div>
        <div className="min-w-0 max-w-full overflow-x-auto rounded-lg bg-surface-border/40 p-1">
          <div className="flex w-max gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  year === y ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:text-neutral-800",
                )}
              >
                {labels.yearButton(y)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            axisLine={{ stroke: COLORS.grid }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `${currencySymbol}${v}`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #2a3544",
              borderRadius: "12px",
            }}
            formatter={(v: number, name: string) => [fmtMoney(v, market), name]}
            labelFormatter={(_, payload) => {
              const m = payload?.[0]?.payload?.month;
              return m ? labels.tooltipMonth(m, year) : "";
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11 }} />
          <Bar
            dataKey="affitto"
            name={legendLabel(labels.rent, labels.rentIt)}
            fill={COLORS.affitto}
            radius={[3, 3, 0, 0]}
            barSize={14}
          />
          <Bar
            dataKey="mutuo"
            name={legendLabel(labels.mortgage, labels.mortgageIt)}
            stackId="uscite"
            fill={COLORS.mutuo}
            barSize={14}
          />
          <Bar
            dataKey="imposte"
            name={legendLabel(labels.tax, labels.taxIt)}
            stackId="uscite"
            fill={COLORS.imposte}
            barSize={14}
          />
          {activeOpex.map((b, i) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={legendLabel(b.name, b.nameIt)}
              stackId="uscite"
              fill={b.color}
              barSize={14}
              radius={i === activeOpex.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {totals && (
        <div className="mt-4 border-t border-surface-border/60 pt-4">
          <p className="mb-3 text-xs font-medium text-neutral-600">
            {labels.yearTotal(year, totals.months)}
          </p>
          {labels.yearTotalIt && (
            <p className="-mt-2 mb-3 text-[10px] text-neutral-500">
              {labels.yearTotalIt(year, totals.months)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-6">
            {breakdownRows.map((row) => (
              <div key={row.label} className="rounded-lg bg-surface-border/30 px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: row.color }}
                  />
                  <div className="min-w-0">
                    <span className="text-neutral-500">{row.label}</span>
                    {row.labelIt && (
                      <span className="block text-[10px] leading-tight text-neutral-500">{row.labelIt}</span>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 font-semibold text-neutral-800">
                  {fmtMoney(row.yearly / totals.months, market)}
                  <span className="ml-1 text-[10px] font-normal text-neutral-500">{labels.perMonth}</span>
                </p>
                <p className="mt-0.5 text-neutral-600">
                  {fmtMoney(row.yearly, market)}
                  <span className="ml-1 text-[10px] text-neutral-500">{labels.perYear}</span>
                </p>
              </div>
            ))}
          </div>
          {netRow && (
            <div
              className={cn(
                "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
                netRow.yearly >= 0
                  ? "border-green-200 bg-green-50"
                  : "border-red-500/35 bg-red-500/10",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: netRow.color }}
                />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{netRow.label}</p>
                  {netRow.labelIt && (
                    <p className="text-xs text-neutral-500">{netRow.labelIt}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    netRow.yearly >= 0 ? "text-green-600" : "text-red-400",
                  )}
                >
                  {fmtMoney(netRow.yearly / totals.months, market)}
                  <span className="ml-1 text-xs font-normal text-neutral-500">{labels.perMonth}</span>
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-neutral-600">
                  {fmtMoney(netRow.yearly, market)}
                  <span className="ml-1 text-[10px] text-neutral-500">{labels.perYear}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
