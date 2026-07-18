"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ITALY_DEFAULTS } from "@/lib/constants";
import { CZECH_DEFAULTS } from "@/lib/constants-cz";
import { buildMortgageSimSeries, type MortgageSimPoint } from "@/lib/engine/mortgage-sim";
import { getMarket, type MarketId } from "@/lib/markets";
import { useI18n } from "@/lib/i18n/context";
import { CHART_THEME } from "@/lib/chart-theme";
import { cn, fmtMoney } from "@/lib/utils";
import { Landmark } from "lucide-react";

interface Props {
  market?: MarketId;
}

const COLORS = {
  interest: CHART_THEME.negative,
  equity: CHART_THEME.series.blue,
  property: CHART_THEME.positive,
  grid: CHART_THEME.grid,
  axis: CHART_THEME.axis,
};

function defaultsForMarket(market: MarketId) {
  if (market === "cz") {
    return {
      price: CZECH_DEFAULTS.default_purchase_price,
      downPct: CZECH_DEFAULTS.investment_down_payment_pct,
      rate: CZECH_DEFAULTS.mortgage_rate_pct,
      years: CZECH_DEFAULTS.default_loan_years,
    };
  }
  return {
    price: ITALY_DEFAULTS.default_purchase_price,
    downPct: ITALY_DEFAULTS.investment_down_payment_pct,
    rate: ITALY_DEFAULTS.mortgage_rate_pct,
    years: ITALY_DEFAULTS.default_loan_years,
  };
}

function formatCagr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "equity" | "interest" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-surface-border/60 bg-neutral-50 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold",
          tone === "equity" && "text-sky-600",
          tone === "interest" && "text-red-500",
          (!tone || tone === "neutral") && "text-neutral-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export default function MortgageSimulatorPanel({ market = "it" }: Props) {
  const { t } = useI18n();
  const defaults = defaultsForMarket(market);
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";

  const [price, setPrice] = useState(defaults.price);
  const [downPayment, setDownPayment] = useState(
    Math.round((defaults.price * defaults.downPct) / 100),
  );
  const [rate, setRate] = useState(defaults.rate);
  const [years, setYears] = useState(defaults.years);
  const [appreciation, setAppreciation] = useState(2);

  const downPct = price > 0 ? (downPayment / price) * 100 : 0;

  const sim = useMemo(
    () =>
      buildMortgageSimSeries({
        price,
        downPayment,
        annualRate: rate,
        years,
        annualAppreciationPct: appreciation,
      }),
    [price, downPayment, rate, years, appreciation],
  );

  const paymentSplitPoints = useMemo(
    () => sim.points.filter((p) => p.month > 0),
    [sim.points],
  );

  const formatAxis = (value: number) => `${currencySymbol}${(value / 1000).toFixed(0)}k`;

  const setPriceAndKeepPct = (nextPrice: number) => {
    const safe = Number.isFinite(nextPrice) && nextPrice >= 0 ? nextPrice : 0;
    const pct = price > 0 ? downPayment / price : defaults.downPct / 100;
    setPrice(safe);
    setDownPayment(Math.round(safe * pct));
  };

  const setDownPct = (pct: number) => {
    const safe = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
    setDownPayment(Math.round((price * safe) / 100));
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-900">
            <Landmark size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-900">{t("mortgageSim.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-neutral-500">{t("mortgageSim.subtitle")}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">{t("mortgageSim.purchasePrice")}</span>
            <input
              type="number"
              min={0}
              step={1000}
              className="input-field"
              value={price}
              onChange={(e) => setPriceAndKeepPct(Number(e.target.value))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">{t("mortgageSim.downPayment")}</span>
            <input
              type="number"
              min={0}
              step={1000}
              className="input-field"
              value={downPayment}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDownPayment(Number.isFinite(v) ? Math.max(0, Math.min(v, price)) : 0);
              }}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">{t("mortgageSim.downPaymentPct")}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className="input-field"
              value={Number(downPct.toFixed(1))}
              onChange={(e) => setDownPct(Number(e.target.value))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">{t("mortgageSim.interestRate")}</span>
            <input
              type="number"
              min={0}
              step={0.1}
              className="input-field"
              value={rate}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRate(Number.isFinite(v) && v >= 0 ? v : 0);
              }}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">{t("mortgageSim.loanYears")}</span>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              className="input-field"
              value={years}
              onChange={(e) => {
                const v = Number(e.target.value);
                setYears(Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1);
              }}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">
              {t("mortgageSim.appreciation")}
            </span>
            <input
              type="number"
              min={-5}
              max={20}
              step={0.1}
              className="input-field"
              value={appreciation}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAppreciation(Number.isFinite(v) ? v : 0);
              }}
            />
            <span className="text-[11px] text-neutral-500">{t("mortgageSim.appreciationHint")}</span>
          </label>
          <div className="flex flex-col justify-end rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-2 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">
              {t("mortgageSim.loanAmount")}
            </p>
            <p className="text-base font-semibold text-neutral-900">
              {fmtMoney(sim.loanAmount, market)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("mortgageSim.monthlyPayment")} value={fmtMoney(sim.monthlyPayment, market)} />
        <Kpi
          label={t("mortgageSim.totalInterest")}
          value={fmtMoney(sim.totalInterest, market)}
          tone="interest"
        />
        <Kpi
          label={t("mortgageSim.finalEquity")}
          value={fmtMoney(sim.finalEquity, market)}
          tone="equity"
        />
        <Kpi
          label={t("mortgageSim.cagr")}
          value={formatCagr(sim.cagr)}
          hint={t("mortgageSim.cagrHint", { years, appreciation })}
        />
      </div>

      {sim.loanAmount > 0 ? (
        <div className="card p-5">
          <h3 className="mb-4 text-base font-semibold text-neutral-900">
            {t("mortgageSim.paymentSplitChart")}
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={paymentSplitPoints}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: COLORS.axis, fontSize: 11 }}
                tickFormatter={(m) => `${m / 12}`}
                axisLine={{ stroke: COLORS.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: COLORS.axis, fontSize: 11 }}
                tickFormatter={(v) => fmtMoney(v, market)}
                width={72}
                axisLine={false}
                tickLine={false}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as MortgageSimPoint;
                  return (
                    <div className="rounded-xl border border-surface-border bg-white px-3 py-2 text-xs shadow-lg">
                      <p className="mb-2 font-medium text-neutral-800">
                        {t("mortgageSim.yearTooltip", {
                          year: Math.ceil(Number(label) / 12),
                        })}
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.monthlyPayment")}:{" "}
                        <span className="font-medium text-neutral-900">
                          {fmtMoney(row.monthlyPayment, market)}
                        </span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.monthInterest")}:{" "}
                        <span className="text-red-500">{fmtMoney(row.monthInterest, market)}</span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.monthPrincipal")}:{" "}
                        <span className="text-sky-600">{fmtMoney(row.monthPrincipal, market)}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11 }} />
              <Bar
                stackId="split"
                dataKey="monthPrincipal"
                name={t("mortgageSim.monthPrincipal")}
                fill={COLORS.equity}
              />
              <Bar
                stackId="split"
                dataKey="monthInterest"
                name={t("mortgageSim.monthInterest")}
                fill={COLORS.interest}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {sim.loanAmount <= 0 ? (
        <p className="rounded-xl border border-surface-border/60 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
          {t("mortgageSim.noLoan")}
        </p>
      ) : (
        <div className="card p-5">
          <h3 className="mb-4 text-base font-semibold text-neutral-900">{t("mortgageSim.chartTitle")}</h3>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart
              data={sim.points}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
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
                  const row = payload[0]?.payload as MortgageSimPoint;
                  return (
                    <div className="rounded-xl border border-surface-border bg-white px-3 py-2 text-xs shadow-lg">
                      <p className="mb-2 font-medium text-neutral-800">
                        {label === 0
                          ? t("mortgageSim.purchaseTooltip")
                          : t("mortgageSim.yearTooltip", {
                              year: Math.ceil(Number(label) / 12),
                            })}
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.propertyValue")}:{" "}
                        <span className="text-green-600">{fmtMoney(row.propertyValue, market)}</span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.equity")}:{" "}
                        <span className="text-sky-600">{fmtMoney(row.equity, market)}</span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.bankInterest")}:{" "}
                        <span className="text-red-500">
                          {fmtMoney(row.cumulativeInterest, market)}
                        </span>
                      </p>
                      <p className="mt-1 font-medium text-neutral-800">
                        {t("mortgageSim.totalPaid")}: {fmtMoney(row.totalPaid, market)}
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
              <Bar
                stackId="paid"
                dataKey="equity"
                name={t("mortgageSim.equity")}
                fill={COLORS.equity}
              />
              <Bar
                stackId="paid"
                dataKey="cumulativeInterest"
                name={t("mortgageSim.bankInterest")}
                fill={COLORS.interest}
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="propertyValue"
                name={t("mortgageSim.propertyValue")}
                stroke={COLORS.property}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
