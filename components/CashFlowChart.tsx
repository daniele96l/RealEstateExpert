"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { AnalysisResult } from "@/lib/types";
import { fmtEuro } from "@/lib/utils";

interface Props {
  result: AnalysisResult;
}

const CHART_COLORS = {
  net: "#34d399",
  cumulative: "#60a5fa",
  grid: "#2a3544",
  axis: "#64748b",
};

export default function CashFlowChart({ result }: Props) {
  const data = result.monthly_series.map((p) => ({
    month: p.month,
    netCashFlow: p.net_cash_flow,
    cumulative: p.cumulative_cash_flow,
  }));

  const breakEven = result.summary.break_even_month;

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-base font-semibold text-neutral-900">Flusso di cassa mensile</h2>
      <p className="mb-5 text-sm text-neutral-500">Andamento mensile e posizione cumulata nel tempo</p>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickFormatter={(m) => (m % 12 === 1 || m === 1 ? `A${Math.ceil(m / 12)}` : "")}
            interval={11}
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #2a3544",
              borderRadius: "12px",
            }}
            formatter={(v: number) => fmtEuro(v)}
            labelFormatter={(m) => `Mese ${m}`}
          />
          <Legend wrapperStyle={{ paddingTop: 16 }} />
          <ReferenceLine yAxisId="left" y={0} stroke="#475569" strokeDasharray="4 4" />
          {breakEven && (
            <ReferenceLine
              x={breakEven}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{
                value: `Pareggio M${breakEven}`,
                position: "top",
                fill: "#10b981",
                fontSize: 11,
              }}
            />
          )}
          <Bar
            yAxisId="left"
            dataKey="netCashFlow"
            name="Flusso netto mensile"
            fill={CHART_COLORS.net}
            opacity={0.75}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative"
            name="Cumulato"
            stroke={CHART_COLORS.cumulative}
            strokeWidth={2.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
