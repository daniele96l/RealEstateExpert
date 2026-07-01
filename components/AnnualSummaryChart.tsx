"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import type { AnalysisResult } from "@/lib/types";
import { fmtEuro } from "@/lib/utils";

interface Props {
  result: AnalysisResult;
}

export default function AnnualSummaryChart({ result }: Props) {
  const data = result.annual_series.slice(0, 10).map((a) => ({
    year: `A${a.year}`,
    entrate: a.gross_rent,
    uscite: a.total_opex + a.rental_tax + a.mortgage_payment,
    netto: a.net_cash_flow,
  }));

  return (
    <div className="card-glass p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-100">Riepilogo annuale</h2>
      <p className="mb-5 text-sm text-slate-500">Entrate, uscite totali e flusso netto</p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3544" vertical={false} />
          <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#2a3544" }} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#1a2332", border: "1px solid #2a3544", borderRadius: "12px" }}
            formatter={(v: number) => fmtEuro(v)}
          />
          <Legend wrapperStyle={{ paddingTop: 12 }} />
          <Bar dataKey="entrate" name="Affitto lordo" fill="#34d399" radius={[4, 4, 0, 0]} barSize={20} />
          <Bar dataKey="uscite" name="Uscite totali" fill="#f87171" radius={[4, 4, 0, 0]} barSize={20} />
          <Line type="monotone" dataKey="netto" name="Flusso netto" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
