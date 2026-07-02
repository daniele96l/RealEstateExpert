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

    const points = [
      {
        month: 0,
        initialEquity,
        principalEquity: 0,
        appreciation: 0,
        totalEquity: initialEquity,
        roiPct: 0,
      },
    ];

    for (const p of result.monthly_series) {
      cumPrincipal += p.mortgage_principal;
      const appreciation = p.property_value - purchasePrice;
      const totalEquity = p.property_value - p.mortgage_balance;

      points.push({
        month: p.month,
        initialEquity,
        principalEquity: cumPrincipal,
        appreciation,
        totalEquity,
        roiPct: initialCash > 0 ? ((totalEquity - initialEquity) / initialCash) * 100 : 0,
      });
    }

    return points;
  }, [result.monthly_series, initialCash, initialEquity, purchasePrice]);

  const finalRoi = data[data.length - 1]?.roiPct ?? 0;
  const finalEquity = data[data.length - 1]?.totalEquity ?? initialEquity;

  return (
    <div className="card-glass p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">ROI — equity immobile</h2>
          <p className="text-sm text-slate-500">
            Quota di proprietà posseduta: anticipo ({fmtEuro(downPayment)}), capitale mutuo ripagato e
            rivalutazione
          </p>
        </div>
        <div className="rounded-lg bg-surface-border/40 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Equity finale</p>
          <p className="text-lg font-bold text-slate-100">{fmtEuro(finalEquity)}</p>
          <p className={`text-xs font-medium ${finalRoi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {finalRoi >= 0 ? "+" : ""}
            {finalRoi.toFixed(1)}% sul capitale investito
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
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
                  <p className="mt-2 border-t border-surface-border pt-2 font-semibold text-slate-200">
                    Equity totale: {fmtEuro(row.totalEquity)}
                    <span className="ml-2 text-slate-500">
                      ({row.roiPct >= 0 ? "+" : ""}
                      {row.roiPct.toFixed(1)}%)
                    </span>
                  </p>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="initialEquity"
            name="Anticipo"
            stackId="equity"
            fill={COLORS.initial}
            stroke={COLORS.initial}
            fillOpacity={0.35}
          />
          <Area
            type="monotone"
            dataKey="principalEquity"
            name="Capitale mutuo ripagato"
            stackId="equity"
            fill={COLORS.principal}
            stroke={COLORS.principal}
            fillOpacity={0.35}
          />
          <Area
            type="monotone"
            dataKey="appreciation"
            name="Rivalutazione"
            stackId="equity"
            fill={COLORS.appreciation}
            stroke={COLORS.appreciation}
            fillOpacity={0.35}
          />
          <Line
            type="monotone"
            dataKey="totalEquity"
            name="Equity totale"
            stroke={COLORS.total}
            strokeWidth={2.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
