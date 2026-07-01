"use client";

import { cn, fmtEuro, fmtPct } from "@/lib/utils";
import type { AnalysisResult } from "@/lib/types";
import { TrendingUp, TrendingDown, Wallet, Calendar, Percent, Target, PiggyBank } from "lucide-react";

interface Props {
  result: AnalysisResult;
}

function Metric({
  icon: Icon,
  label,
  value,
  positive,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  positive?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={cn("metric-card", highlight && "border-accent/40 bg-gradient-to-br from-accent/10 to-transparent")}>
      <div className="mb-2 flex items-center justify-between">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", highlight ? "bg-accent/20 text-accent" : "bg-surface-border/60 text-slate-400")}>
          <Icon size={16} />
        </div>
        {positive !== undefined && (positive ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-rose-400" />)}
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold", positive === true && "text-emerald-400", positive === false && "text-rose-400", positive === undefined && "text-slate-100")}>
        {value}
      </p>
    </div>
  );
}

export default function SummaryCards({ result }: Props) {
  const s = result.summary;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Metric icon={Wallet} label="Capitale iniziale" value={fmtEuro(s.initial_cash_required)} highlight />
      <Metric icon={PiggyBank} label="Rata mutuo" value={fmtEuro(s.monthly_mortgage_payment)} />
      <Metric icon={TrendingUp} label="Flusso netto anno 1" value={fmtEuro(s.year_1_net_cash_flow)} positive={s.year_1_net_cash_flow >= 0} />
      <Metric icon={Calendar} label="Pareggio flussi" value={s.break_even_month ? `Mese ${s.break_even_month}` : "Mai"} highlight={!!s.break_even_month} />
      <Metric icon={Percent} label="Cash-on-cash (A1)" value={fmtPct(s.cash_on_cash_return_pct)} positive={s.cash_on_cash_return_pct >= 0} />
      <Metric icon={Target} label={`ROI ${result.annual_series.length} anni`} value={fmtPct(s.total_roi_pct)} positive={s.total_roi_pct >= 0} />
    </div>
  );
}
