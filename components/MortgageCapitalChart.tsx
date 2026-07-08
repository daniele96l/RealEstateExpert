"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { CHART_THEME } from "@/lib/chart-theme";

interface Props {
  result: AnalysisResult;
  market?: MarketId;
}

const COLORS = {
  interest: CHART_THEME.negative,
  equity: CHART_THEME.series.blue,
  grid: CHART_THEME.grid,
  axis: CHART_THEME.axis,
};

type ChartPoint = {
  month: number;
  year: number;
  equityPaid: number;
  cumulativeInterest: number;
  totalPaid: number;
};

function buildYearlyPoints(
  monthlySeries: AnalysisResult["monthly_series"],
  downPayment: number,
): {
  data: ChartPoint[];
  totalEquityPaid: number;
  totalInterest: number;
} {
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  const lastMonth = monthlySeries[monthlySeries.length - 1]?.month ?? 0;
  const data: ChartPoint[] = [];

  const pushPoint = (month: number, year: number) => {
    const equityPaid = downPayment + cumulativePrincipal;
    data.push({
      month,
      year,
      equityPaid,
      cumulativeInterest,
      totalPaid: equityPaid + cumulativeInterest,
    });
  };

  pushPoint(0, 0);

  for (const point of monthlySeries) {
    cumulativeInterest += point.mortgage_interest;
    cumulativePrincipal += point.mortgage_principal;
    const isYearEnd = point.month % 12 === 0;
    const isLast = point.month === lastMonth;
    if (isYearEnd || isLast) {
      pushPoint(point.month, point.year);
    }
  }

  const last = data[data.length - 1];
  return {
    data,
    totalEquityPaid: last?.equityPaid ?? downPayment,
    totalInterest: cumulativeInterest,
  };
}

export default function MortgageCapitalChart({ result, market = "it" }: Props) {
  const { t } = useI18n();
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const downPayment = result.summary.purchase_costs.down_payment;
  const loanAmount = result.summary.purchase_costs.loan_amount;

  const { data, totalEquityPaid, totalInterest } = useMemo(
    () => buildYearlyPoints(result.monthly_series, downPayment),
    [result.monthly_series, downPayment],
  );

  const totalPaid = totalEquityPaid + totalInterest;
  const formatAxis = (value: number) => `${currencySymbol}${(value / 1000).toFixed(0)}k`;

  return (
    <div className="card p-5">
      <div className="mb-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{t("mortgageCapital.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-500">
            {t("mortgageCapital.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">
              {t("mortgageCapital.equityPaid")}
            </p>
            <p className="text-lg font-bold text-sky-400">{fmtMoney(totalEquityPaid, market)}</p>
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">
              {t("mortgageCapital.totalInterest")}
            </p>
            <p className="text-lg font-bold text-red-400">{fmtMoney(totalInterest, market)}</p>
            {loanAmount <= 0 && (
              <p className="text-[11px] text-neutral-500">{t("mortgageCapital.noMortgage")}</p>
            )}
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">
              {t("mortgageCapital.totalPaid")}
            </p>
            <p className="text-lg font-bold text-neutral-900">{fmtMoney(totalPaid, market)}</p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barCategoryGap="20%">
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
                <div className="rounded-xl border border-surface-border bg-white px-3 py-2 text-xs shadow-lg">
                  <p className="mb-2 font-medium text-neutral-800">
                    {label === 0
                      ? t("mortgageCapital.purchaseTooltip")
                      : t("mortgageCapital.yearTooltip", { year: Math.ceil(Number(label) / 12) })}
                  </p>
                  <p className="text-neutral-600">
                    {t("mortgageCapital.equityPaid")}:{" "}
                    <span className="text-sky-400">{fmtMoney(row.equityPaid, market)}</span>
                  </p>
                  <p className="text-neutral-600">
                    {t("mortgageCapital.cumulativeInterest")}:{" "}
                    <span className="text-red-400">{fmtMoney(row.cumulativeInterest, market)}</span>
                  </p>
                  <p className="mt-1 font-medium text-neutral-800">
                    {t("mortgageCapital.totalPaid")}: {fmtMoney(row.totalPaid, market)}
                  </p>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
          <Bar
            stackId="paid"
            dataKey="equityPaid"
            name={t("mortgageCapital.equityPaid")}
            fill={COLORS.equity}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            stackId="paid"
            dataKey="cumulativeInterest"
            name={t("mortgageCapital.cumulativeInterest")}
            fill={COLORS.interest}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
