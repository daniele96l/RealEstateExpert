"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getMarket, type MarketId } from "@/lib/markets";
import type { AnalysisResult } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

interface Props {
  result: AnalysisResult;
  market?: MarketId;
}

const COLORS = {
  interest: "#f87171",
  capital: "#60a5fa",
  property: "#34d399",
  appreciation: "#fbbf24",
  grid: "#2a3544",
  axis: "#64748b",
};

type ChartPoint = {
  month: number;
  year: number;
  initialCapital: number;
  cumulativeInterest: number;
  purchasePrice: number;
  propertyAppreciation: number;
  propertyValue: number;
};

function buildYearlyPoints(
  monthlySeries: AnalysisResult["monthly_series"],
  initialCapital: number,
): { data: ChartPoint[]; totalInterest: number; finalPropertyValue: number; interestCrossMonth: number | null } {
  const purchasePrice = monthlySeries[0]?.property_value ?? 0;
  let cumulativeInterest = 0;
  let crossMonth: number | null = null;
  const lastMonth = monthlySeries[monthlySeries.length - 1]?.month ?? 0;

  const pushPoint = (month: number, year: number, propertyValue: number) => {
    data.push({
      month,
      year,
      initialCapital,
      cumulativeInterest,
      purchasePrice,
      propertyAppreciation: Math.max(0, propertyValue - purchasePrice),
      propertyValue,
    });
  };

  const data: ChartPoint[] = [];
  pushPoint(0, 0, purchasePrice);

  for (const point of monthlySeries) {
    cumulativeInterest += point.mortgage_interest;
    if (crossMonth == null && cumulativeInterest >= initialCapital && initialCapital > 0) {
      crossMonth = point.month;
    }
    const isYearEnd = point.month % 12 === 0;
    const isLast = point.month === lastMonth;
    if (isYearEnd || isLast) {
      pushPoint(point.month, point.year, point.property_value);
    }
  }

  const finalPropertyValue = data[data.length - 1]?.propertyValue ?? purchasePrice;

  return {
    data,
    totalInterest: cumulativeInterest,
    finalPropertyValue,
    interestCrossMonth: crossMonth,
  };
}

export default function MortgageCapitalChart({ result, market = "it" }: Props) {
  const { t } = useI18n();
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const initialCapital = result.summary.purchase_costs.total_initial_cash;
  const loanAmount = result.summary.purchase_costs.loan_amount;

  const { data, totalInterest, finalPropertyValue, interestCrossMonth } = useMemo(
    () => buildYearlyPoints(result.monthly_series, initialCapital),
    [result.monthly_series, initialCapital],
  );

  const formatAxis = (value: number) => `${currencySymbol}${(value / 1000).toFixed(0)}k`;

  return (
    <div className="card-glass p-5">
      <div className="mb-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">{t("mortgageCapital.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
            {t("mortgageCapital.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {t("mortgageCapital.initialCapital")}
            </p>
            <p className="text-lg font-bold text-slate-100">{fmtMoney(initialCapital, market)}</p>
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {t("mortgageCapital.totalInterest")}
            </p>
            <p className="text-lg font-bold text-red-400">{fmtMoney(totalInterest, market)}</p>
            {loanAmount <= 0 && (
              <p className="text-[11px] text-slate-500">{t("mortgageCapital.noMortgage")}</p>
            )}
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {t("mortgageCapital.propertyValue")}
            </p>
            <p className="text-lg font-bold text-emerald-400">{fmtMoney(finalPropertyValue, market)}</p>
          </div>
          {interestCrossMonth != null && (
            <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                {t("mortgageCapital.interestExceedsCapital")}
              </p>
              <p className="text-lg font-bold text-amber-400">
                {t("mortgageCapital.monthLabel", { month: interestCrossMonth })}
              </p>
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(m) => (m === 0 ? t("common.start") : `${m / 12}`)}
            axisLine={{ stroke: COLORS.grid }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={formatAxis}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as ChartPoint;
              return (
                <div className="rounded-xl border border-surface-border bg-[#1a2332] px-3 py-2 text-xs shadow-lg">
                  <p className="mb-2 font-medium text-slate-200">
                    {label === 0
                      ? t("mortgageCapital.purchaseTooltip")
                      : t("mortgageCapital.yearTooltip", { year: Math.ceil(Number(label) / 12) })}
                  </p>
                  <p className="text-slate-400">
                    {t("mortgageCapital.initialCapital")}:{" "}
                    <span className="text-sky-400">{fmtMoney(row.initialCapital, market)}</span>
                  </p>
                  <p className="text-slate-400">
                    {t("mortgageCapital.cumulativeInterest")}:{" "}
                    <span className="text-red-400">{fmtMoney(row.cumulativeInterest, market)}</span>
                  </p>
                  <p className="text-slate-400">
                    {t("mortgageCapital.purchasePrice")}:{" "}
                    <span className="text-emerald-400">{fmtMoney(row.purchasePrice, market)}</span>
                  </p>
                  <p className="text-slate-400">
                    {t("mortgageCapital.propertyAppreciation")}:{" "}
                    <span className="text-amber-400">{fmtMoney(row.propertyAppreciation, market)}</span>
                  </p>
                  <p className="mt-1 font-medium text-slate-200">
                    {t("mortgageCapital.propertyValue")}: {fmtMoney(row.propertyValue, market)}
                  </p>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
          <Bar
            stackId="outlay"
            dataKey="initialCapital"
            name={t("mortgageCapital.initialCapital")}
            fill={COLORS.capital}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            stackId="outlay"
            dataKey="cumulativeInterest"
            name={t("mortgageCapital.cumulativeInterest")}
            fill={COLORS.interest}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            stackId="value"
            dataKey="purchasePrice"
            name={t("mortgageCapital.purchasePrice")}
            fill={COLORS.property}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            stackId="value"
            dataKey="propertyAppreciation"
            name={t("mortgageCapital.propertyAppreciation")}
            fill={COLORS.appreciation}
            radius={[4, 4, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
