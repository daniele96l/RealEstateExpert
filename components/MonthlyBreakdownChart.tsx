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
import { cn, fmtMoney } from "@/lib/utils";
import { getMarket, type MarketId } from "@/lib/markets";
import { useI18n, type TFunction } from "@/lib/i18n/context";
import itLocale from "@/lib/i18n/locales/it";

interface Props {
  result: AnalysisResult;
  market?: MarketId;
}

function legendLabel(primary: string, secondary?: string) {
  return secondary ? `${primary} (${secondary})` : primary;
}

const COLORS = {
  affitto: "#34d399",
  mutuo: "#a78bfa",
  imposte: "#fb923c",
  grid: "#2a3544",
  axis: "#64748b",
};

const OPEX_BAR_DEFS = [
  { key: "imu", color: "#ef4444" },
  { key: "tari", color: "#f97316" },
  { key: "condominio", color: "#eab308" },
  { key: "insurance", color: "#84cc16" },
  { key: "maintenance", color: "#22d3ee" },
  { key: "utilities", color: "#38bdf8" },
  { key: "platform_fee", color: "#c084fc" },
] as const;

type OpexKey = (typeof OPEX_BAR_DEFS)[number]["key"];

function monthlyLabels(market: MarketId, t: TFunction) {
  const it = itLocale;
  if (market === "cz") {
    return {
      rent: "Nájemné",
      rentIt: it.common.rent,
      mortgage: "Hypotéka",
      mortgageIt: it.common.mortgage,
      net: "Čistý výsledek",
      netIt: it.common.net,
      perMonth: "/měs.",
      perYear: "/rok",
      title: "Měsíční přehled příjmů a výdajů",
      titleIt: it.monthly.title,
      subtitle: "Nájemné vs hypotéka, daň z příjmu a každá položka nákladů",
      subtitleIt: it.monthly.subtitleIt,
      tax: "Daň z příjmu",
      taxIt: "Imposta sul reddito",
      mortgageOn: (amount: string) => `Hypotéka vypočtena na celkovou částku ${amount}`,
      mortgageOnIt: (amount: string) =>
        it.monthly.mortgageOn.replace("{amount}", amount),
      yearTotal: (year: number, months: number) =>
        `Celkem rok ${year} — měsíční hodnoty = průměr za ${months} měsíců`,
      yearTotalIt: (year: number, months: number) =>
        it.monthly.yearTotal.replace("{year}", String(year)).replace("{months}", String(months)),
      tooltipMonth: (month: number, year: number) => `Měsíc ${month} (rok ${year})`,
      yearButton: (y: number) => `R${y}`,
      opexNames: {
        imu: "IMU",
        tari: "Daň z nemovitosti",
        condominio: "Společenství vlastníků",
        insurance: "Pojištění",
        maintenance: "Údržba",
        utilities: "Energie",
        platform_fee: "Platforma",
      } satisfies Record<OpexKey, string>,
      opexIt: {
        imu: it.monthly.opex.imu,
        tari: "Imposta immobiliare",
        condominio: it.monthly.opex.condominio,
        insurance: it.monthly.opex.insurance,
        maintenance: it.monthly.opex.maintenance,
        utilities: it.monthly.opex.utilities,
        platform_fee: it.monthly.opex.platform,
      } satisfies Record<OpexKey, string>,
    };
  }
  return {
    rent: t("common.rent"),
    rentIt: undefined as string | undefined,
    mortgage: t("common.mortgage"),
    mortgageIt: undefined as string | undefined,
    net: t("common.net"),
    netIt: undefined as string | undefined,
    perMonth: t("common.perMonth"),
    perYear: t("common.perYear"),
    title: t("monthly.title"),
    titleIt: undefined as string | undefined,
    subtitle: t("monthly.subtitleIt"),
    subtitleIt: undefined as string | undefined,
    tax: t("monthly.flatTax"),
    taxIt: undefined as string | undefined,
    mortgageOn: (amount: string) => t("monthly.mortgageOn", { amount }),
    mortgageOnIt: undefined as ((amount: string) => string) | undefined,
    yearTotal: (year: number, months: number) => t("monthly.yearTotal", { year, months }),
    yearTotalIt: undefined as ((year: number, months: number) => string) | undefined,
    tooltipMonth: (month: number, year: number) => t("monthly.tooltipMonth", { month, year }),
    opexNames: {
      imu: t("monthly.opex.imu"),
      tari: t("monthly.opex.tari"),
      condominio: t("monthly.opex.condominio"),
      insurance: t("monthly.opex.insurance"),
      maintenance: t("monthly.opex.maintenance"),
      utilities: t("monthly.opex.utilities"),
      platform_fee: t("monthly.opex.platform"),
    } satisfies Record<OpexKey, string>,
    opexIt: undefined as Record<OpexKey, string> | undefined,
    yearButton: (y: number) => `A${y}`,
  };
}

function opexBarsForMarket(market: MarketId, t: TFunction) {
  const lbl = monthlyLabels(market, t);
  const bars = OPEX_BAR_DEFS.map((b) => ({
    ...b,
    name: lbl.opexNames[b.key],
    nameIt: lbl.opexIt?.[b.key],
  }));
  return market === "cz" ? bars.filter((b) => b.key !== "imu") : bars;
}

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
    netto: p.net_cash_flow,
  };
}

function yearTotal(points: MonthlyCashFlowPoint[], key: OpexKey): number {
  return points.reduce((s, p) => s + p[key], 0);
}

export default function MonthlyBreakdownChart({ result, market = "it" }: Props) {
  const { t } = useI18n();
  const [year, setYear] = useState(1);
  const labels = useMemo(() => monthlyLabels(market, t), [market, t]);
  const currencySymbol = getMarket(market).currency === "CZK" ? "Kč" : "€";
  const opexBars = useMemo(() => opexBarsForMarket(market, t), [market, t]);

  const years = useMemo(
    () => [...new Set(result.monthly_series.map((p) => p.year))].sort((a, b) => a - b),
    [result.monthly_series],
  );

  const yearPoints = useMemo(
    () => result.monthly_series.filter((p) => p.year === year),
    [result.monthly_series, year],
  );

  const activeOpex = useMemo(
    () => opexBars.filter((b) => yearTotal(yearPoints, b.key) > 0),
    [yearPoints, opexBars],
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
      opexBars.map((b) => [b.key, data.reduce((s, d) => s + d[b.key], 0)]),
    ) as Record<OpexKey, number>;
    return { ...base, opex, months: data.length };
  }, [data, opexBars]);

  const summaryRows = useMemo(() => {
    if (!totals) return [];
    return [
      { label: labels.rent, labelIt: labels.rentIt, yearly: totals.affitto, color: COLORS.affitto },
      { label: labels.mortgage, labelIt: labels.mortgageIt, yearly: totals.mutuo, color: COLORS.mutuo },
      { label: labels.tax, labelIt: labels.taxIt, yearly: totals.imposte, color: COLORS.imposte },
      ...activeOpex.map((b) => ({
        label: b.name,
        labelIt: b.nameIt,
        yearly: totals.opex[b.key],
        color: b.color,
      })),
      {
        label: labels.net,
        labelIt: labels.netIt,
        yearly: totals.netto,
        color: totals.netto >= 0 ? COLORS.affitto : "#f87171",
      },
    ];
  }, [totals, activeOpex, labels]);

  return (
    <div className="card-glass p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">{labels.title}</h2>
          {labels.titleIt && <p className="text-xs text-slate-600">{labels.titleIt}</p>}
          <p className="text-sm text-slate-500">{labels.subtitle}</p>
          {labels.subtitleIt && <p className="text-xs text-slate-600">{labels.subtitleIt}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {labels.mortgageOn(fmtMoney(result.summary.loan_amount, market))}
          </p>
          {labels.mortgageOnIt && (
            <p className="text-[10px] text-slate-600">
              {labels.mortgageOnIt(fmtMoney(result.summary.loan_amount, market))}
            </p>
          )}
        </div>
        <div className="min-w-0 max-w-full overflow-x-auto rounded-lg bg-surface-border/40 p-1">
          <div className="flex w-max gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  year === y ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {labels.yearButton(y)}
              </button>
            ))}
          </div>
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
            tickFormatter={(v) => `${currencySymbol}${v}`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#1a2332",
              border: "1px solid #2a3544",
              borderRadius: "12px",
            }}
            formatter={(v: number, name: string) => [fmtMoney(v, market), name]}
            labelFormatter={(_, payload) => {
              const m = payload?.[0]?.payload?.month;
              return m ? labels.tooltipMonth(m, year) : "";
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11 }} />
          <Bar
            dataKey="affitto"
            name={legendLabel(labels.rent, labels.rentIt)}
            fill={COLORS.affitto}
            radius={[3, 3, 0, 0]}
            barSize={14}
          />
          <Bar
            dataKey="mutuo"
            name={legendLabel(labels.mortgage, labels.mortgageIt)}
            stackId="uscite"
            fill={COLORS.mutuo}
            barSize={14}
          />
          <Bar
            dataKey="imposte"
            name={legendLabel(labels.tax, labels.taxIt)}
            stackId="uscite"
            fill={COLORS.imposte}
            barSize={14}
          />
          {activeOpex.map((b, i) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={legendLabel(b.name, b.nameIt)}
              stackId="uscite"
              fill={b.color}
              barSize={14}
              radius={i === activeOpex.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {totals && (
        <div className="mt-4 border-t border-surface-border/60 pt-4">
          <p className="mb-3 text-xs font-medium text-slate-400">
            {labels.yearTotal(year, totals.months)}
          </p>
          {labels.yearTotalIt && (
            <p className="-mt-2 mb-3 text-[10px] text-slate-600">
              {labels.yearTotalIt(year, totals.months)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-6">
            {summaryRows.map((row) => (
              <div key={row.label} className="rounded-lg bg-surface-border/30 px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: row.color }}
                  />
                  <div className="min-w-0">
                    <span className="text-slate-500">{row.label}</span>
                    {row.labelIt && (
                      <span className="block text-[10px] leading-tight text-slate-600">{row.labelIt}</span>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 font-semibold text-slate-200">
                  {fmtMoney(row.yearly / totals.months, market)}
                  <span className="ml-1 text-[10px] font-normal text-slate-500">{labels.perMonth}</span>
                </p>
                <p className="mt-0.5 text-slate-400">
                  {fmtMoney(row.yearly, market)}
                  <span className="ml-1 text-[10px] text-slate-500">{labels.perYear}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
