"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { loadMarketHistoryCacheFirst } from "@/lib/cache-first";
import {
  historicalSaleCagr,
  propertyValueAtMonth,
  rentMultiplierAtMonth,
} from "@/lib/market-cagr";
import { getMarket, type MarketId } from "@/lib/markets";
import type { AnalysisResult, MonthlyCashFlowPoint } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { CHART_THEME } from "@/lib/chart-theme";

interface Props {
  result: AnalysisResult;
  market?: MarketId;
  city?: string;
}

const COLORS = {
  total: CHART_THEME.series.blue,
  initial: CHART_THEME.tertiary,
  principal: CHART_THEME.series.violet,
  appreciation: CHART_THEME.series.amber,
  cashPositive: CHART_THEME.positive,
  cashNegative: CHART_THEME.negative,
  equityPlusCash: CHART_THEME.primary,
  grid: CHART_THEME.grid,
  axis: CHART_THEME.axis,
};

function annualizedReturn(totalReturnPct: number, years: number): number {
  if (years <= 0 || totalReturnPct <= -100) return 0;
  const growthFactor = 1 + totalReturnPct / 100;
  return growthFactor > 0 ? (Math.pow(growthFactor, 1 / years) - 1) * 100 : 0;
}

const APPRECIATION_PRESETS = [0, 1, 2, 3, 4, 5, 6] as const;
const HISTORICAL_APPRECIATION = "historical";
const TIME_RANGE_PRESETS = [5, 10, 15, 20] as const;
const TIME_RANGE_FULL = "full";

function adjustNetCashFlowForRentGrowth(point: MonthlyCashFlowPoint, rentMultiplier: number): number {
  if (rentMultiplier === 1) return point.net_cash_flow;
  const scalable = point.gross_rent - point.platform_fee - point.rental_tax - point.agency_fee;
  return point.net_cash_flow + scalable * (rentMultiplier - 1);
}

interface AppreciationSelectProps {
  label: string;
  value: string;
  historicalCagrPct: number | null;
  onChange: (value: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function AppreciationSelect({
  label,
  value,
  historicalCagrPct,
  onChange,
  t,
}: AppreciationSelectProps) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
      <span>{label}</span>
      <select
        className="select-field !w-auto !py-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {APPRECIATION_PRESETS.map((pct) => (
          <option key={pct} value={String(pct)}>
            {pct === 0 ? t("roi.appreciationFlat") : t("roi.appreciationPerYear", { pct })}
          </option>
        ))}
        <option value={HISTORICAL_APPRECIATION} disabled={historicalCagrPct == null}>
          {historicalCagrPct != null
            ? t("roi.appreciationHistorical", { pct: historicalCagrPct.toFixed(1) })
            : t("roi.historicalCagrUnavailable")}
        </option>
      </select>
    </label>
  );
}

export default function RoiChart({ result, market = "it", city = "" }: Props) {
  const { t } = useI18n();
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const [appreciationSelection, setAppreciationSelection] = useState<string>("0");
  const [rentAppreciationSelection, setRentAppreciationSelection] = useState<string>("0");
  const [historicalCagrPct, setHistoricalCagrPct] = useState<number | null>(null);
  const [historicalRentCagrPct, setHistoricalRentCagrPct] = useState<number | null>(null);
  const [timeRangeSelection, setTimeRangeSelection] = useState<string>(TIME_RANGE_FULL);

  const fullProjectionYears = Math.ceil(
    (result.monthly_series[result.monthly_series.length - 1]?.month ?? 0) / 12,
  );

  const downPayment = result.summary.purchase_costs.down_payment;
  const purchaseCosts = result.summary.purchase_costs;
  const taxesAndAccessories =
    purchaseCosts.registration_tax +
    purchaseCosts.vat +
    purchaseCosts.notary +
    purchaseCosts.agency;
  const purchasePrice = result.monthly_series[0]?.property_value ?? 0;
  const initialEquity = downPayment;

  const loadMarketCagr = useCallback(async () => {
    if (!city.trim()) {
      setHistoricalCagrPct(null);
      setHistoricalRentCagrPct(null);
      return;
    }
    try {
      const { data } = await loadMarketHistoryCacheFirst(city.trim(), false, market);
      setHistoricalCagrPct(historicalSaleCagr(data.sale ?? []));
      setHistoricalRentCagrPct(historicalSaleCagr(data.rent ?? []));
    } catch {
      setHistoricalCagrPct(null);
      setHistoricalRentCagrPct(null);
    }
  }, [city, market]);

  useEffect(() => {
    void loadMarketCagr();
  }, [loadMarketCagr]);

  useEffect(() => {
    if (historicalCagrPct == null && appreciationSelection === HISTORICAL_APPRECIATION) {
      setAppreciationSelection("0");
    }
  }, [historicalCagrPct, appreciationSelection]);

  useEffect(() => {
    if (historicalRentCagrPct == null && rentAppreciationSelection === HISTORICAL_APPRECIATION) {
      setRentAppreciationSelection("0");
    }
  }, [historicalRentCagrPct, rentAppreciationSelection]);

  useEffect(() => {
    setTimeRangeSelection(TIME_RANGE_FULL);
  }, [fullProjectionYears, result.monthly_series.length]);

  const selectedYears =
    timeRangeSelection === TIME_RANGE_FULL
      ? fullProjectionYears
      : Math.min(Number(timeRangeSelection) || fullProjectionYears, fullProjectionYears);

  const timeRangeOptions = useMemo(() => {
    const presets = TIME_RANGE_PRESETS.filter((years) => years < fullProjectionYears);
    return presets;
  }, [fullProjectionYears]);

  const appreciationRatePct =
    appreciationSelection === HISTORICAL_APPRECIATION
      ? (historicalCagrPct ?? 0)
      : Number(appreciationSelection) || 0;

  const rentAppreciationRatePct =
    rentAppreciationSelection === HISTORICAL_APPRECIATION
      ? (historicalRentCagrPct ?? 0)
      : Number(rentAppreciationSelection) || 0;

  const data = useMemo(() => {
    let cumPrincipal = 0;
    const cashStart = -taxesAndAccessories;
    let cumulativeCash = cashStart;
    let yearCash = 0;
    let currentYear: number | null = null;

    const points = [
      {
        month: 0,
        year: 0,
        initialEquity,
        principalEquity: 0,
        appreciation: 0,
        totalEquity: initialEquity,
        cumulativeCash: cashStart,
        yearlyCash: cashStart,
        equityPlusCash: initialEquity + cashStart,
        roiPct: 0,
      },
    ];

    for (const p of result.monthly_series) {
      if (currentYear !== p.year) {
        currentYear = p.year;
        yearCash = 0;
      }
      const rentMultiplier = rentMultiplierAtMonth(p.month, rentAppreciationRatePct);
      const netCashFlow = adjustNetCashFlowForRentGrowth(p, rentMultiplier);
      yearCash += netCashFlow;
      cumulativeCash += netCashFlow;
      cumPrincipal += p.mortgage_principal;

      const propertyValue =
        appreciationRatePct !== 0
          ? propertyValueAtMonth(purchasePrice, p.month, appreciationRatePct)
          : p.property_value;
      const appreciation = propertyValue - purchasePrice;
      const totalEquity = initialEquity + cumPrincipal + appreciation;

      points.push({
        month: p.month,
        year: p.year,
        initialEquity,
        principalEquity: cumPrincipal,
        appreciation,
        totalEquity,
        cumulativeCash,
        yearlyCash: yearCash,
        equityPlusCash: totalEquity + cumulativeCash,
        roiPct: downPayment > 0 ? ((totalEquity - initialEquity) / downPayment) * 100 : 0,
      });
    }

    return points;
  }, [
    result.monthly_series,
    downPayment,
    initialEquity,
    purchasePrice,
    taxesAndAccessories,
    appreciationRatePct,
    rentAppreciationRatePct,
  ]);

  const chartData = useMemo(() => {
    const maxMonth = selectedYears * 12;
    return data.filter((point) => point.month <= maxMonth);
  }, [data, selectedYears]);

  const lastPoint = chartData[chartData.length - 1];
  const finalEquity = lastPoint?.totalEquity ?? initialEquity;
  const finalCumulativeCash = lastPoint?.cumulativeCash ?? -taxesAndAccessories;
  const finalEquityPlusCash = lastPoint?.equityPlusCash ?? initialEquity;
  const projectionYears = (lastPoint?.month ?? 0) / 12;
  const equityRoi =
    downPayment > 0 ? ((finalEquity - initialEquity) / downPayment) * 100 : 0;
  const totalRoiOnAnticipo =
    downPayment > 0 ? ((finalEquityPlusCash - downPayment) / downPayment) * 100 : 0;
  const improvementCosts = purchaseCosts.renovation + purchaseCosts.furnishing;
  const finalEquityExImprovements = finalEquity - improvementCosts;
  const finalTotalExImprovements = finalEquityPlusCash - improvementCosts;
  const equityCagr = annualizedReturn(equityRoi, projectionYears);
  const totalCagrOnAnticipo = annualizedReturn(totalRoiOnAnticipo, projectionYears);
  const initialInvestment = downPayment + taxesAndAccessories;
  const totalRoiOnInvestment =
    initialInvestment > 0 ? ((finalEquityPlusCash - initialInvestment) / initialInvestment) * 100 : 0;
  const totalCagrOnInvestment = annualizedReturn(totalRoiOnInvestment, projectionYears);
  const cashLineColor = finalCumulativeCash >= 0 ? COLORS.cashPositive : COLORS.cashNegative;
  const maxMonth = lastPoint?.month ?? 0;
  const yearTickStep = maxMonth > 240 ? 60 : maxMonth > 120 ? 24 : 12;
  const yearTicks = useMemo(() => {
    const ticks = [0];
    for (let month = yearTickStep; month <= maxMonth; month += yearTickStep) ticks.push(month);
    return ticks;
  }, [maxMonth, yearTickStep]);

  return (
    <div className="card p-5">
      <div className="mb-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{t("roi.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-500">
            {t("roi.subtitle", { downPayment: fmtMoney(downPayment, market) })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <AppreciationSelect
              label={t("roi.appreciationRate")}
              value={appreciationSelection}
              historicalCagrPct={historicalCagrPct}
              onChange={setAppreciationSelection}
              t={t}
            />
            <AppreciationSelect
              label={t("roi.rentAppreciationRate")}
              value={rentAppreciationSelection}
              historicalCagrPct={historicalRentCagrPct}
              onChange={setRentAppreciationSelection}
              t={t}
            />
            <label className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              <span>{t("roi.timeRange")}</span>
              <select
                className="select-field !w-auto !py-1 text-xs"
                value={timeRangeSelection}
                onChange={(e) => setTimeRangeSelection(e.target.value)}
              >
                {timeRangeOptions.map((years) => (
                  <option key={years} value={String(years)}>
                    {t("roi.timeRangeYears", { years })}
                  </option>
                ))}
                <option value={TIME_RANGE_FULL}>
                  {t("roi.timeRangeFull", { years: fullProjectionYears })}
                </option>
              </select>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">{t("roi.downPayment")}</p>
            <p className="text-lg font-bold text-neutral-900">{fmtMoney(downPayment, market)}</p>
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">{t("roi.taxesAccessories")}</p>
            <p className="text-lg font-bold text-neutral-900">{fmtMoney(taxesAndAccessories, market)}</p>
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">{t("roi.downPaymentPlusFees")}</p>
            <p className="text-lg font-bold text-neutral-900">{fmtMoney(initialInvestment, market)}</p>
            <p className={`text-xs font-medium ${totalCagrOnInvestment >= 0 ? "text-green-600" : "text-red-400"}`}>
              {totalCagrOnInvestment >= 0 ? "+" : ""}
              {t("roi.cagrOnDownPaymentPlusFees", { pct: totalCagrOnInvestment.toFixed(1) })}
            </p>
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">{t("roi.finalEquity")}</p>
            <p className="text-lg font-bold text-neutral-900">{fmtMoney(finalEquity, market)}</p>
            {improvementCosts > 0 && (
              <p className="text-[11px] text-neutral-500">
                {t("roi.withoutImprovements", { amount: fmtMoney(finalEquityExImprovements, market) })}
              </p>
            )}
            <p className={`text-xs font-medium ${equityCagr >= 0 ? "text-green-600" : "text-red-400"}`}>
              {equityCagr >= 0 ? "+" : ""}
              {t("roi.cagrOnDownPayment", { pct: equityCagr.toFixed(1) })}
            </p>
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">{t("common.total")}</p>
            <p className="text-lg font-bold text-cyan-400">{fmtMoney(finalEquityPlusCash, market)}</p>
            {improvementCosts > 0 && (
              <p className="text-[11px] text-neutral-500">
                {t("roi.withoutImprovements", { amount: fmtMoney(finalTotalExImprovements, market) })}
              </p>
            )}
            <p className={`text-xs font-medium ${totalCagrOnAnticipo >= 0 ? "text-green-600" : "text-red-400"}`}>
              {totalCagrOnAnticipo >= 0 ? "+" : ""}
              {t("roi.cagrOnDownPayment", { pct: totalCagrOnAnticipo.toFixed(1) })}
            </p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="month"
            ticks={yearTicks}
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(m) => (m === 0 ? t("common.start") : `${m / 12}`)}
            axisLine={{ stroke: COLORS.grid }}
            tickLine={false}
          />
          <YAxis
            yAxisId="equity"
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <YAxis
            yAxisId="cash"
            orientation="right"
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload;
              return (
                <div className="rounded-xl border border-surface-border bg-white px-3 py-2 text-xs shadow-lg">
                  <p className="mb-2 font-medium text-neutral-800">
                    {label === 0 ? t("roi.purchaseTooltip") : t("roi.yearTooltip", { year: Math.ceil(label / 12) })}
                  </p>
                  <p className="text-neutral-600">
                    {t("roi.initialShare")}:{" "}
                    <span className="text-neutral-800">{fmtMoney(row.initialEquity, market)}</span>
                  </p>
                  <p className="text-neutral-600">
                    {t("roi.principalRepaid")}:{" "}
                    <span className="text-violet-400">{fmtMoney(row.principalEquity, market)}</span>
                  </p>
                  <p className="text-neutral-600">
                    {t("roi.appreciation")}:{" "}
                    <span className="text-amber-400">{fmtMoney(row.appreciation, market)}</span>
                    {appreciationRatePct !== 0 && (
                      <span className="ml-1 text-neutral-500">
                        ({appreciationRatePct.toFixed(1)}%/yr)
                      </span>
                    )}
                  </p>
                  {row.year > 0 && (
                    <p className="text-neutral-600">
                      Cashflow {row.year}:{" "}
                      <span className={row.yearlyCash >= 0 ? "text-green-600" : "text-red-400"}>
                        {fmtMoney(row.yearlyCash, market)}
                      </span>
                    </p>
                  )}
                  <p className="text-neutral-600">
                    {t("roi.cumulativeCash")}:{" "}
                    <span className={row.cumulativeCash >= 0 ? "text-green-600" : "text-red-400"}>
                      {fmtMoney(row.cumulativeCash, market)}
                    </span>
                  </p>
                  <p className="mt-2 border-t border-surface-border pt-2 font-semibold text-neutral-800">
                    {t("roi.totalEquity")}: {fmtMoney(row.totalEquity, market)}
                    <span className="ml-2 text-neutral-500">
                      ({row.roiPct >= 0 ? "+" : ""}
                      {row.roiPct.toFixed(1)}%)
                    </span>
                  </p>
                  <p className="font-semibold text-cyan-400">
                    {t("roi.equityPlusCash")}: {fmtMoney(row.equityPlusCash, market)}
                  </p>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
          <Area
            yAxisId="equity"
            type="monotone"
            dataKey="initialEquity"
            name={t("roi.downPayment")}
            stackId="equity"
            fill={COLORS.initial}
            stroke={COLORS.initial}
            fillOpacity={0.35}
          />
          <Area
            yAxisId="equity"
            type="monotone"
            dataKey="principalEquity"
            name={t("roi.principalPaid")}
            stackId="equity"
            fill={COLORS.principal}
            stroke={COLORS.principal}
            fillOpacity={0.35}
          />
          <Area
            yAxisId="equity"
            type="monotone"
            dataKey="appreciation"
            name={t("roi.propertyAppreciation")}
            stackId="equity"
            fill={COLORS.appreciation}
            stroke={COLORS.appreciation}
            fillOpacity={0.35}
          />
          <Line
            yAxisId="equity"
            type="monotone"
            dataKey="totalEquity"
            name={t("roi.totalEquity")}
            stroke={COLORS.total}
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            yAxisId="equity"
            type="monotone"
            dataKey="equityPlusCash"
            name={t("roi.equityAndCash")}
            stroke={COLORS.equityPlusCash}
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            yAxisId="cash"
            type="monotone"
            dataKey="cumulativeCash"
            name={t("roi.cumulativeCashflow")}
            stroke={cashLineColor}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
