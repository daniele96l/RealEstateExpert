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
import { cn, fmtEuro } from "@/lib/utils";

interface Props {
  result: AnalysisResult;
}

const COLORS = {
  affitto: "#34d399",
  mutuo: "#a78bfa",
  imposte: "#fb923c",
  grid: "#2a3544",
  axis: "#64748b",
};

const OPEX_BARS = [
  { key: "imu", name: "IMU", color: "#ef4444" },
  { key: "tari", name: "TARI", color: "#f97316" },
  { key: "condominio", name: "Condominio", color: "#eab308" },
  { key: "insurance", name: "Assicurazione", color: "#84cc16" },
  { key: "maintenance", name: "Manutenzione", color: "#22d3ee" },
  { key: "utilities", name: "Bollette", color: "#38bdf8" },
  { key: "agency_fee", name: "Agenzia", color: "#a78bfa" },
  { key: "platform_fee", name: "Piattaforma", color: "#c084fc" },
  { key: "cleaning_fee", name: "Pulizie", color: "#f472b6" },
] as const;

type OpexKey = (typeof OPEX_BARS)[number]["key"];

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
    cleaning_fee: p.cleaning_fee,
    netto: p.net_cash_flow,
  };
}

function yearTotal(points: MonthlyCashFlowPoint[], key: OpexKey): number {
  return points.reduce((s, p) => s + p[key], 0);
}

export default function MonthlyBreakdownChart({ result }: Props) {
  const [year, setYear] = useState(1);

  const years = useMemo(
    () => [...new Set(result.monthly_series.map((p) => p.year))].sort((a, b) => a - b),
    [result.monthly_series],
  );

  const yearPoints = useMemo(
    () => result.monthly_series.filter((p) => p.year === year),
    [result.monthly_series, year],
  );

  const activeOpex = useMemo(
    () => OPEX_BARS.filter((b) => yearTotal(yearPoints, b.key) > 0),
    [yearPoints],
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
      OPEX_BARS.map((b) => [b.key, data.reduce((s, d) => s + d[b.key], 0)]),
    ) as Record<OpexKey, number>;
    return { ...base, opex };
  }, [data]);

  return (
    <div className="card-glass p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Dettaglio mensile entrate/uscite</h2>
          <p className="text-sm text-slate-500">Affitto vs mutuo, imposte e ogni voce di spesa</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-border/40 p-1">
          {years.slice(0, 10).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                year === y ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200",
              )}
            >
              A{y}
            </button>
          ))}
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
            tickFormatter={(v) => `€${v}`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#1a2332",
              border: "1px solid #2a3544",
              borderRadius: "12px",
            }}
            formatter={(v: number, name: string) => [fmtEuro(v), name]}
            labelFormatter={(_, payload) => {
              const m = payload?.[0]?.payload?.month;
              return m ? `Mese ${m} (anno ${year})` : "";
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11 }} />
          <Bar dataKey="affitto" name="Affitto" fill={COLORS.affitto} radius={[3, 3, 0, 0]} barSize={14} />
          <Bar dataKey="mutuo" name="Mutuo" stackId="uscite" fill={COLORS.mutuo} barSize={14} />
          <Bar dataKey="imposte" name="Imposte" stackId="uscite" fill={COLORS.imposte} barSize={14} />
          {activeOpex.map((b, i) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name}
              stackId="uscite"
              fill={b.color}
              barSize={14}
              radius={i === activeOpex.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {totals && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-surface-border/60 pt-4 text-xs sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Affitto", value: totals.affitto, color: COLORS.affitto },
            { label: "Mutuo", value: totals.mutuo, color: COLORS.mutuo },
            { label: "Imposte", value: totals.imposte, color: COLORS.imposte },
            ...activeOpex.map((b) => ({
              label: b.name,
              value: totals.opex[b.key],
              color: b.color,
            })),
            {
              label: "Netto",
              value: totals.netto,
              color: totals.netto >= 0 ? COLORS.affitto : "#f87171",
            },
          ].map((row) => (
            <div key={row.label} className="rounded-lg bg-surface-border/30 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
                <span className="text-slate-500">{row.label}</span>
              </div>
              <p className="mt-0.5 font-semibold text-slate-200">{fmtEuro(row.value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
