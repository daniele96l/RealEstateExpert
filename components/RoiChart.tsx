"use client";

import { useMemo } from "react";
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
import type { AnalysisResult } from "@/lib/types";
import { fmtEuro } from "@/lib/utils";

interface Props {
  result: AnalysisResult;
}

const COLORS = {
  total: "#60a5fa",
  initial: "#64748b",
  principal: "#a78bfa",
  appreciation: "#fbbf24",
  cashPositive: "#34d399",
  cashNegative: "#f87171",
  equityPlusCash: "#22d3ee",
  grid: "#2a3544",
  axis: "#64748b",
};

export default function RoiChart({ result }: Props) {
  const initialCash = result.summary.initial_cash_required;
  const downPayment = result.summary.purchase_costs.down_payment;
  const purchasePrice = result.monthly_series[0]?.property_value ?? 0;
  const loanAmount = result.summary.loan_amount;
  const initialEquity = purchasePrice - loanAmount;

  const data = useMemo(() => {
    let cumPrincipal = 0;
    let cumulativeCash = 0;

    const points = [
      {
        month: 0,
        year: 0,
        initialEquity,
        principalEquity: 0,
        appreciation: 0,
        totalEquity: initialEquity,
        cumulativeCash: 0,
        equityPlusCash: initialEquity,
        roiPct: 0,
      },
    ];

    for (const p of result.monthly_series) {
      cumulativeCash += p.net_cash_flow;
      cumPrincipal += p.mortgage_principal;
      const appreciation = p.property_value - purchasePrice;
      const totalEquity = p.property_value - p.mortgage_balance;

      points.push({
        month: p.month,
        year: p.year,
        initialEquity,
        principalEquity: cumPrincipal,
        appreciation,
        totalEquity,
        cumulativeCash,
        equityPlusCash: totalEquity + cumulativeCash,
        roiPct: initialCash > 0 ? ((totalEquity - initialEquity) / initialCash) * 100 : 0,
      });
    }

    return points;
  }, [result.monthly_series, initialCash, initialEquity, purchasePrice]);

  const lastPoint = data[data.length - 1];
  const finalRoi = lastPoint?.roiPct ?? 0;
  const finalEquity = lastPoint?.totalEquity ?? initialEquity;
  const finalCumulativeCash = lastPoint?.cumulativeCash ?? 0;
  const finalEquityPlusCash = lastPoint?.equityPlusCash ?? initialEquity;
  const projectionYears = (lastPoint?.month ?? 0) / 12;
  const growthFactor = 1 + finalRoi / 100;
  const cagr =
    projectionYears > 0 && initialCash > 0 && growthFactor > 0
      ? (Math.pow(growthFactor, 1 / projectionYears) - 1) * 100
      : 0;
  const cashLineColor = finalCumulativeCash >= 0 ? COLORS.cashPositive : COLORS.cashNegative;

  return (
    <div className="card-glass p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">ROI — equity immobile</h2>
          <p className="text-sm text-slate-500">
            Quota di proprietà: anticipo ({fmtEuro(downPayment)}), capitale mutuo ripagato, rivalutazione
            e cashflow netto cumulato negli anni (asse destro)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Equity finale</p>
            <p className="text-lg font-bold text-slate-100">{fmtEuro(finalEquity)}</p>
            <p className={`text-xs font-medium ${cagr >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {cagr >= 0 ? "+" : ""}
              {cagr.toFixed(1)}% CAGR annuale
            </p>
          </div>
          <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Cashflow cumulato</p>
            <p
              className={`text-lg font-bold ${finalCumulativeCash >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {fmtEuro(finalCumulativeCash)}
            </p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 10, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(m) => (m === 0 ? "Inizio" : m % 12 === 1 || m === 1 ? `A${Math.ceil(m / 12)}` : "")}
            interval={11}
            axisLine={{ stroke: COLORS.grid }}
            tickLine={false}
          />
          <YAxis
            yAxisId="equity"
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <YAxis
            yAxisId="cash"
            orientation="right"
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload;
              return (
                <div className="rounded-xl border border-surface-border bg-[#1a2332] px-3 py-2 text-xs shadow-lg">
                  <p className="mb-2 font-medium text-slate-200">
                    {label === 0 ? "Acquisto" : `Mese ${label}`}
                  </p>
                  <p className="text-slate-400">
                    Anticipo (quota iniziale):{" "}
                    <span className="text-slate-200">{fmtEuro(row.initialEquity)}</span>
                  </p>
                  <p className="text-slate-400">
                    Capitale mutuo ripagato:{" "}
                    <span className="text-violet-400">{fmtEuro(row.principalEquity)}</span>
                  </p>
                  <p className="text-slate-400">
                    Rivalutazione: <span className="text-amber-400">{fmtEuro(row.appreciation)}</span>
                  </p>
                  <p className="text-slate-400">
                    Cashflow netto cumulato:{" "}
                    <span className={row.cumulativeCash >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {fmtEuro(row.cumulativeCash)}
                    </span>
                  </p>
                  <p className="mt-2 border-t border-surface-border pt-2 font-semibold text-slate-200">
                    Equity totale: {fmtEuro(row.totalEquity)}
                    <span className="ml-2 text-slate-500">
                      ({row.roiPct >= 0 ? "+" : ""}
                      {row.roiPct.toFixed(1)}%)
                    </span>
                  </p>
                  <p className="font-semibold text-cyan-400">
                    Equity + cashflow: {fmtEuro(row.equityPlusCash)}
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
            name="Anticipo"
            stackId="equity"
            fill={COLORS.initial}
            stroke={COLORS.initial}
            fillOpacity={0.35}
          />
          <Area
            yAxisId="equity"
            type="monotone"
            dataKey="principalEquity"
            name="Capitale mutuo ripagato"
            stackId="equity"
            fill={COLORS.principal}
            stroke={COLORS.principal}
            fillOpacity={0.35}
          />
          <Area
            yAxisId="equity"
            type="monotone"
            dataKey="appreciation"
            name="Rivalutazione"
            stackId="equity"
            fill={COLORS.appreciation}
            stroke={COLORS.appreciation}
            fillOpacity={0.35}
          />
          <Line
            yAxisId="equity"
            type="monotone"
            dataKey="totalEquity"
            name="Equity totale"
            stroke={COLORS.total}
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            yAxisId="equity"
            type="monotone"
            dataKey="equityPlusCash"
            name="Equity + cashflow"
            stroke={COLORS.equityPlusCash}
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            yAxisId="cash"
            type="monotone"
            dataKey="cumulativeCash"
            name="Cashflow netto cumulato"
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
