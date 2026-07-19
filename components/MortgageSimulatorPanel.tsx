"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scaleSymlog } from "d3-scale";
import {
  estimateMonthlyRent,
  estimateNightlyRate,
  estimateSqmFromPrice,
  estimateUtilitiesAnnual,
  ITALY_DEFAULTS,
} from "@/lib/constants";
import {
  CZECH_DEFAULTS,
  estimateCzechMonthlyRent,
  estimateCzechNightlyRate,
  estimateCzechUtilitiesAnnual,
} from "@/lib/constants-cz";
import { buildMortgageSimSeries, MORTGAGE_SIM_ETF_RETURN_PCT, type MortgageSimPoint } from "@/lib/engine/mortgage-sim";
import { shortTermNetMonthly } from "@/lib/engine/rental";
import {
  MAINTENANCE_PCT_OPTIONS,
  monthlyMaintenanceCost,
} from "@/lib/maintenance-options";
import { getMarket, type MarketId } from "@/lib/markets";
import { useI18n } from "@/lib/i18n/context";
import { CHART_THEME } from "@/lib/chart-theme";
import { cn, fmtMoney } from "@/lib/utils";
import { Landmark } from "lucide-react";

type RentMode = "long_term" | "short_term_airbnb";

interface Props {
  market?: MarketId;
}

const COLORS = {
  interest: CHART_THEME.negative,
  equity: CHART_THEME.series.blue,
  costs: CHART_THEME.series.amber,
  tenant: CHART_THEME.series.cyan,
  rentSaved: CHART_THEME.series.violet,
  property: CHART_THEME.positive,
  grid: CHART_THEME.grid,
  axis: CHART_THEME.axis,
};

function estimatePropertyTaxAnnual(price: number, market: MarketId): number {
  if (market === "cz") {
    return Math.round(price * CZECH_DEFAULTS.property_tax_rate);
  }
  return Math.round(
    price * ITALY_DEFAULTS.cadastral_ratio * ITALY_DEFAULTS.imu_rate,
  );
}

function estimateAvoidedRent(price: number, market: MarketId): number {
  return market === "cz"
    ? estimateCzechMonthlyRent(price)
    : estimateMonthlyRent(price);
}

function estimateAirbnbUtilitiesAnnual(
  price: number,
  occupancyPct: number,
  market: MarketId,
): number {
  if (market === "cz") {
    return estimateCzechUtilitiesAnnual(
      CZECH_DEFAULTS.default_sqm,
      "C",
      "short_term_airbnb",
      occupancyPct,
    );
  }
  return estimateUtilitiesAnnual(
    estimateSqmFromPrice(price),
    "C",
    "short_term_airbnb",
    occupancyPct,
  );
}

function defaultsForMarket(market: MarketId) {
  if (market === "cz") {
    return {
      price: CZECH_DEFAULTS.default_purchase_price,
      downPct: CZECH_DEFAULTS.investment_down_payment_pct,
      rate: CZECH_DEFAULTS.mortgage_rate_pct,
      years: CZECH_DEFAULTS.default_loan_years,
      maintenancePct: 0.005,
    };
  }
  return {
    price: 300_000,
    downPct: ITALY_DEFAULTS.investment_down_payment_pct,
    rate: ITALY_DEFAULTS.mortgage_rate_pct,
    years: ITALY_DEFAULTS.default_loan_years,
    maintenancePct: 0.005,
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

  const [price, setPrice] = useState<number>(defaults.price);
  const [downPct, setDownPct] = useState<number>(defaults.downPct);
  const [rate, setRate] = useState<number>(defaults.rate);
  const [years, setYears] = useState<number>(defaults.years);
  const [appreciation, setAppreciation] = useState(0);
  const [maintenancePct, setMaintenancePct] = useState<number>(defaults.maintenancePct);
  const [propertyTaxAnnual, setPropertyTaxAnnual] = useState(() =>
    estimatePropertyTaxAnnual(defaults.price, market),
  );
  const [rentEnabled, setRentEnabled] = useState(false);
  const [rentMode, setRentMode] = useState<RentMode>("long_term");
  const [liveInEnabled, setLiveInEnabled] = useState(false);
  const [tenantMonthlyAmount, setTenantMonthlyAmount] = useState(
    market === "cz" ? 15_000 : 300,
  );
  const marketDefaults = market === "cz" ? CZECH_DEFAULTS : ITALY_DEFAULTS;
  const [nightlyRate, setNightlyRate] = useState(() =>
    market === "cz"
      ? estimateCzechNightlyRate(defaults.price)
      : estimateNightlyRate(defaults.price),
  );
  const [occupancyPct, setOccupancyPct] = useState(65);
  const [platformFeePct, setPlatformFeePct] = useState(
    marketDefaults.platform_fee_pct * 100,
  );
  const [avgStayNights, setAvgStayNights] = useState<number>(marketDefaults.avg_stay_nights);
  const [cleaningPerTurnover, setCleaningPerTurnover] = useState<number>(
    marketDefaults.cleaning_fee_per_turnover,
  );
  const [agencyFeePct, setAgencyFeePct] = useState<number>(
    marketDefaults.property_manager_fee_pct,
  );
  const [rentalTaxPct, setRentalTaxPct] = useState<number>(
    market === "cz"
      ? CZECH_DEFAULTS.rental_income_tax_pct
      : ITALY_DEFAULTS.cedolare_short_first_property * 100,
  );
  const [utilitiesAnnual, setUtilitiesAnnual] = useState(() =>
    estimateAirbnbUtilitiesAnnual(defaults.price, 65, market),
  );
  const [monthlyRentAvoided, setMonthlyRentAvoided] = useState(
    market === "cz" ? estimateAvoidedRent(defaults.price, market) : 1000,
  );
  const [rentGrowthPct, setRentGrowthPct] = useState(2);
  const [showAfterMortgage, setShowAfterMortgage] = useState(true);

  const downPayment = Math.round((price * downPct) / 100);
  const maintenanceMonthly = monthlyMaintenanceCost(price, maintenancePct);
  const utilitiesMonthly = Math.round((Math.max(0, utilitiesAnnual) / 12) * 100) / 100;

  const airbnbNet = useMemo(
    () =>
      shortTermNetMonthly({
        nightlyRate,
        occupancyPct,
        platformFeePct,
        avgStayNights,
        cleaningPerTurnover,
        agencyFeePct,
        taxPct: rentalTaxPct,
        utilitiesMonthly,
      }),
    [
      nightlyRate,
      occupancyPct,
      platformFeePct,
      avgStayNights,
      cleaningPerTurnover,
      agencyFeePct,
      rentalTaxPct,
      utilitiesMonthly,
    ],
  );

  const effectiveTenantMonthly =
    rentEnabled && rentMode === "short_term_airbnb"
      ? airbnbNet.net
      : tenantMonthlyAmount;

  const selectRentMode = (mode: RentMode) => {
    setRentMode(mode);
    if (mode !== "short_term_airbnb") return;
    const airbnbPrice = market === "cz" ? 1_800_000 : 80_000;
    setPrice(airbnbPrice);
    setPropertyTaxAnnual(estimatePropertyTaxAnnual(airbnbPrice, market));
    const longDefault =
      market === "cz" ? CZECH_DEFAULTS.maintenance_pct_long : ITALY_DEFAULTS.maintenance_pct_long;
    const panelDefault = defaults.maintenancePct;
    if (maintenancePct === longDefault || maintenancePct === panelDefault) {
      setMaintenancePct(
        market === "cz"
          ? CZECH_DEFAULTS.maintenance_pct_short
          : ITALY_DEFAULTS.maintenance_pct_short,
      );
    }
    setNightlyRate(
      market === "cz"
        ? estimateCzechNightlyRate(airbnbPrice)
        : estimateNightlyRate(airbnbPrice),
    );
    setUtilitiesAnnual(
      estimateAirbnbUtilitiesAnnual(airbnbPrice, occupancyPct, market),
    );
  };

  const sim = useMemo(
    () =>
      buildMortgageSimSeries({
        price,
        downPayment,
        annualRate: rate,
        years,
        annualAppreciationPct: appreciation,
        rentEnabled,
        tenantMonthlyAmount: effectiveTenantMonthly,
        liveInEnabled,
        monthlyRentAvoided,
        rentGrowthPct,
        maintenancePct,
        propertyTaxAnnual,
      }),
    [
      price,
      downPayment,
      rate,
      years,
      appreciation,
      rentEnabled,
      effectiveTenantMonthly,
      liveInEnabled,
      monthlyRentAvoided,
      rentGrowthPct,
      maintenancePct,
      propertyTaxAnnual,
    ],
  );

  const loanMonths = years * 12;

  const chartPoints = useMemo(() => {
    if (showAfterMortgage) return sim.points;
    return sim.points.filter((p) => p.month <= loanMonths);
  }, [sim.points, showAfterMortgage, loanMonths]);

  const paymentSplitPoints = useMemo(() => {
    const rentGrossBar =
      !rentEnabled
        ? 0
        : rentMode === "short_term_airbnb"
          ? airbnbNet.gross
          : effectiveTenantMonthly;
    return chartPoints
      .filter((p) => p.month > 0)
      .map((p) => ({
        ...p,
        monthRentGross: rentGrossBar,
      }));
  }, [
    chartPoints,
    rentEnabled,
    rentMode,
    airbnbNet.gross,
    effectiveTenantMonthly,
  ]);

  const yearlyCostPoints = useMemo(() => {
    const pts = chartPoints.filter((p) => p.month > 0);
    return pts.map((p, i) => {
      const prev = i === 0 ? (chartPoints[0] ?? sim.points[0]!) : pts[i - 1]!;
      const yearOwnCost = Math.round((p.totalPaid - prev.totalPaid) * 100) / 100;
      const yearRentCost =
        Math.round((p.cumulativeRentAvoided - prev.cumulativeRentAvoided) * 100) / 100;
      return {
        year: p.year,
        month: p.month,
        yearOwnCost,
        yearRentCost,
        yearDiff: Math.round((yearOwnCost - yearRentCost) * 100) / 100,
      };
    });
  }, [chartPoints, sim.points]);

  const formatAxis = (value: number) => `${currencySymbol}${(value / 1000).toFixed(0)}k`;

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
              onChange={(e) => {
                const v = Number(e.target.value);
                const next = Number.isFinite(v) && v >= 0 ? v : 0;
                setPrice(next);
                setPropertyTaxAnnual(estimatePropertyTaxAnnual(next, market));
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
              value={downPct}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDownPct(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
              }}
            />
            <span className="text-[11px] text-neutral-500">{fmtMoney(downPayment, market)}</span>
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
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">
              {t("mortgageSim.maintenance")}
            </span>
            <select
              className="select-field"
              value={maintenancePct}
              onChange={(e) => setMaintenancePct(Number(e.target.value))}
            >
              {MAINTENANCE_PCT_OPTIONS.map(({ id, pct }) => (
                <option key={id} value={pct}>
                  {t(`scenario.maintenanceOptions.${id}`)}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-neutral-500">
              {t("mortgageSim.maintenanceHint", {
                monthly: fmtMoney(maintenanceMonthly, market),
                annual: fmtMoney(maintenanceMonthly * 12, market),
              })}
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-600">
              {t("mortgageSim.propertyTax")}
            </span>
            <input
              type="number"
              min={0}
              step={50}
              className="input-field"
              value={propertyTaxAnnual}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPropertyTaxAnnual(Number.isFinite(v) && v >= 0 ? v : 0);
              }}
            />
            <span className="text-[11px] text-neutral-500">
              {t("mortgageSim.propertyTaxHint")}
            </span>
          </label>
          <div className="flex flex-col justify-end rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-2 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">
              {t("mortgageSim.loanAmount")}
            </p>
            <p className="text-base font-semibold text-neutral-900">
              {fmtMoney(sim.loanAmount, market)}
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-2.5 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
              checked={rentEnabled}
              onChange={(e) => {
                const on = e.target.checked;
                setRentEnabled(on);
                if (on) setLiveInEnabled(false);
              }}
            />
            <span>
              <span className="block text-xs font-medium text-neutral-700">
                {t("mortgageSim.rentToggle")}
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-500">
                {t("mortgageSim.rentToggleHint")}
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-2.5 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
              checked={liveInEnabled}
              onChange={(e) => {
                const on = e.target.checked;
                setLiveInEnabled(on);
                if (on) setRentEnabled(false);
              }}
            />
            <span>
              <span className="block text-xs font-medium text-neutral-700">
                {t("mortgageSim.liveInToggle")}
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-500">
                {t("mortgageSim.liveInToggleHint")}
              </span>
            </span>
          </label>
          {rentEnabled ? (
            <div className="space-y-3 sm:col-span-2">
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-600">
                  {t("mortgageSim.rentToggle")}
                </p>
                <div className="flex overflow-hidden rounded-lg border border-surface-border">
                  {(
                    [
                      { id: "long_term" as const, label: t("mortgageSim.rentModeLong") },
                      {
                        id: "short_term_airbnb" as const,
                        label: t("mortgageSim.rentModeAirbnb"),
                      },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectRentMode(id)}
                      className={cn(
                        "flex-1 px-3 py-2 text-sm transition-colors",
                        rentMode === id
                          ? "bg-neutral-100 text-neutral-900"
                          : "text-neutral-600 hover:text-neutral-800",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {rentMode === "long_term" ? (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-600">
                    {t("mortgageSim.tenantCoverage")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={market === "cz" ? 500 : 10}
                    className="input-field"
                    value={tenantMonthlyAmount}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTenantMonthlyAmount(Number.isFinite(v) && v >= 0 ? v : 0);
                    }}
                  />
                  <span className="text-[11px] text-neutral-500">
                    {t("mortgageSim.tenantCoverageHint", {
                      pct:
                        sim.monthlyPayment > 0
                          ? ((sim.tenantMonthlyCover / sim.monthlyPayment) * 100).toFixed(0)
                          : "0",
                    })}
                  </span>
                </label>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbNightly")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={market === "cz" ? 50 : 5}
                      className="input-field"
                      value={nightlyRate}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setNightlyRate(Number.isFinite(v) && v >= 0 ? v : 0);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbOccupancy")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="input-field"
                      value={occupancyPct}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setOccupancyPct(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbPlatformFee")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="input-field"
                      value={platformFeePct}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setPlatformFeePct(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbAvgStay")}
                    </span>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className="input-field"
                      value={avgStayNights}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setAvgStayNights(Number.isFinite(v) && v > 0 ? v : 0.5);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbCleaning")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={market === "cz" ? 50 : 5}
                      className="input-field"
                      value={cleaningPerTurnover}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setCleaningPerTurnover(Number.isFinite(v) && v >= 0 ? v : 0);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbAgencyFee")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="input-field"
                      value={agencyFeePct}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setAgencyFeePct(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbTax")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="input-field"
                      value={rentalTaxPct}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRentalTaxPct(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
                      }}
                    />
                  </label>
                  <label className="block space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-medium text-neutral-600">
                      {t("mortgageSim.airbnbUtilities")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={market === "cz" ? 500 : 50}
                      className="input-field"
                      value={utilitiesAnnual}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setUtilitiesAnnual(Number.isFinite(v) && v >= 0 ? v : 0);
                      }}
                    />
                    <span className="text-[11px] text-neutral-500">
                      {t("mortgageSim.airbnbUtilitiesHint", {
                        monthly: fmtMoney(utilitiesMonthly, market),
                      })}
                    </span>
                  </label>
                  <div className="space-y-3 sm:col-span-2">
                    {airbnbNet.gross > 0 ? (
                      <div className="rounded-lg border border-surface-border/60 bg-neutral-50 p-3">
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                            {t("mortgageSim.airbnbBreakdownTitle")}
                          </p>
                          <p className="text-xs text-neutral-600">
                            {t("mortgageSim.airbnbGross")}:{" "}
                            <span className="font-medium text-neutral-900">
                              {fmtMoney(airbnbNet.gross, market)}
                            </span>
                          </p>
                        </div>
                        <div className="flex h-3 overflow-hidden rounded-full bg-neutral-200">
                          {(
                            [
                              {
                                key: "platform",
                                value: airbnbNet.platform,
                                color: "bg-amber-500",
                              },
                              {
                                key: "cleaning",
                                value: airbnbNet.cleaning,
                                color: "bg-orange-400",
                              },
                              {
                                key: "agency",
                                value: airbnbNet.agency,
                                color: "bg-violet-500",
                              },
                              {
                                key: "tax",
                                value: airbnbNet.tax,
                                color: "bg-red-400",
                              },
                              {
                                key: "utilities",
                                value: airbnbNet.utilities,
                                color: "bg-neutral-400",
                              },
                              {
                                key: "net",
                                value: airbnbNet.net,
                                color: "bg-cyan-500",
                              },
                            ] as const
                          ).map((seg) =>
                            seg.value > 0 ? (
                              <div
                                key={seg.key}
                                className={cn("h-full min-w-0", seg.color)}
                                style={{
                                  width: `${(seg.value / airbnbNet.gross) * 100}%`,
                                }}
                                title={`${t(`mortgageSim.airbnbSeg.${seg.key}`)}: ${fmtMoney(seg.value, market)}`}
                              />
                            ) : null,
                          )}
                        </div>
                        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-neutral-600">
                          {(
                            [
                              {
                                key: "platform" as const,
                                value: airbnbNet.platform,
                                dot: "bg-amber-500",
                              },
                              {
                                key: "cleaning" as const,
                                value: airbnbNet.cleaning,
                                dot: "bg-orange-400",
                              },
                              {
                                key: "agency" as const,
                                value: airbnbNet.agency,
                                dot: "bg-violet-500",
                              },
                              {
                                key: "tax" as const,
                                value: airbnbNet.tax,
                                dot: "bg-red-400",
                              },
                              {
                                key: "utilities" as const,
                                value: airbnbNet.utilities,
                                dot: "bg-neutral-400",
                              },
                              {
                                key: "net" as const,
                                value: airbnbNet.net,
                                dot: "bg-cyan-500",
                              },
                            ] as const
                          ).map((row) => (
                            <li key={row.key} className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span
                                  className={cn("h-2 w-2 shrink-0 rounded-sm", row.dot)}
                                />
                                <span className="truncate">
                                  {t(`mortgageSim.airbnbSeg.${row.key}`)}
                                </span>
                              </span>
                              <span className="shrink-0 font-medium text-neutral-800">
                                {fmtMoney(row.value, market)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {sim.monthlyPayment > 0 && airbnbNet.net > 0 ? (
                          <div className="mt-3 border-t border-surface-border/60 pt-2.5">
                            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                              {t("mortgageSim.airbnbNetUseTitle")}
                            </p>
                            <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-200">
                              {sim.tenantMonthlyCover > 0 ? (
                                <div
                                  className="h-full bg-sky-500"
                                  style={{
                                    width: `${(sim.tenantMonthlyCover / airbnbNet.net) * 100}%`,
                                  }}
                                />
                              ) : null}
                              {sim.tenantMonthlySurplus > 0 ? (
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{
                                    width: `${(sim.tenantMonthlySurplus / airbnbNet.net) * 100}%`,
                                  }}
                                />
                              ) : null}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-600">
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-sm bg-sky-500" />
                                {t("mortgageSim.airbnbSeg.cover")}:{" "}
                                <span className="font-medium text-neutral-800">
                                  {fmtMoney(sim.tenantMonthlyCover, market)}
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                                {t("mortgageSim.airbnbSeg.surplus")}:{" "}
                                <span className="font-medium text-neutral-800">
                                  {fmtMoney(sim.tenantMonthlySurplus, market)}
                                </span>
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                        {t("mortgageSim.rentIncome")}
                      </p>
                      <p className="text-base font-semibold text-neutral-900">
                        {fmtMoney(sim.tenantMonthlyIncome, market)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        {t("mortgageSim.airbnbCoverHint", {
                          cover: fmtMoney(sim.tenantMonthlyCover, market),
                          surplus: fmtMoney(sim.tenantMonthlySurplus, market),
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
          {liveInEnabled ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-600">
                  {t("mortgageSim.rentAvoided")}
                </span>
                <input
                  type="number"
                  min={0}
                  step={market === "cz" ? 500 : 10}
                  className="input-field"
                  value={monthlyRentAvoided}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMonthlyRentAvoided(Number.isFinite(v) && v >= 0 ? v : 0);
                  }}
                />
                <span className="text-[11px] text-neutral-500">
                  {t("mortgageSim.rentAvoidedHint")}
                </span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-600">
                  {t("mortgageSim.rentGrowth")}
                </span>
                <input
                  type="number"
                  min={-5}
                  max={20}
                  step={0.1}
                  className="input-field"
                  value={rentGrowthPct}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setRentGrowthPct(Number.isFinite(v) ? v : 0);
                  }}
                />
                <span className="text-[11px] text-neutral-500">
                  {t("mortgageSim.rentGrowthHint")}
                </span>
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("mortgageSim.monthlyPayment")} value={fmtMoney(sim.monthlyPayment, market)} />
        <Kpi
          label={t("mortgageSim.monthlyRecurring")}
          value={fmtMoney(sim.monthlyRecurring, market)}
        />
        {rentEnabled ? (
          <>
            <Kpi
              label={t("mortgageSim.ownerMonthlyNet")}
              value={fmtMoney(sim.ownerMonthlyNet, market)}
            />
            <Kpi
              label={t("mortgageSim.rentIncome")}
              value={fmtMoney(sim.tenantMonthlyIncome, market)}
              tone="equity"
            />
            {sim.tenantMonthlySurplus > 0 ? (
              <Kpi
                label={t("mortgageSim.rentSurplus")}
                value={fmtMoney(sim.tenantMonthlySurplus, market)}
                tone="equity"
              />
            ) : (
              <Kpi
                label={t("mortgageSim.tenantMonthlyCover")}
                value={fmtMoney(sim.tenantMonthlyCover, market)}
                tone="equity"
              />
            )}
          </>
        ) : liveInEnabled ? (
          <>
            <Kpi
              label={t("mortgageSim.ownerMonthlyNet")}
              value={fmtMoney(sim.ownerMonthlyNet, market)}
            />
            <Kpi
              label={t("mortgageSim.monthlyRentAvoided")}
              value={fmtMoney(sim.monthlyRentAvoided, market)}
              tone="equity"
            />
            <Kpi
              label={t("mortgageSim.totalRentAvoided")}
              value={fmtMoney(sim.totalRentAvoided, market)}
              tone="equity"
            />
          </>
        ) : (
          <Kpi
            label={t("mortgageSim.ownerMonthlyNet")}
            value={fmtMoney(sim.ownerMonthlyNet, market)}
          />
        )}
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
          hint={t("mortgageSim.cagrHint", {
            years: sim.horizonYears,
            appreciation,
          })}
        />
        {rentEnabled ? (
          <Kpi
            label={t("mortgageSim.cagrWithRent")}
            value={formatCagr(sim.cagrWithRent)}
            hint={t("mortgageSim.cagrWithRentHint", {
              years: sim.horizonYears,
            })}
            tone="equity"
          />
        ) : null}
      </div>

      {sim.loanAmount > 0 ? (
        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-neutral-900">
              {t("mortgageSim.paymentSplitChart")}
            </h3>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-neutral-300"
                checked={showAfterMortgage}
                onChange={(e) => setShowAfterMortgage(e.target.checked)}
              />
              {t("mortgageSim.showAfterMortgage")}
            </label>
          </div>
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
                      <p className="text-neutral-600">
                        {t("mortgageSim.monthCosts")}:{" "}
                        <span className="text-amber-600">{fmtMoney(row.monthCosts, market)}</span>
                      </p>
                      {rentEnabled ? (
                        <p className="text-neutral-600">
                          {t("mortgageSim.monthRentGross")}:{" "}
                          <span className="text-cyan-600">
                            {fmtMoney(
                              (row as MortgageSimPoint & { monthRentGross?: number })
                                .monthRentGross ?? row.monthRentIncome,
                              market,
                            )}
                          </span>
                        </p>
                      ) : null}
                      {rentEnabled && row.monthRentSurplus > 0 ? (
                        <p className="text-neutral-600">
                          {t("mortgageSim.monthRentSurplus")}:{" "}
                          <span className="text-cyan-600">
                            {fmtMoney(row.monthRentSurplus, market)}
                          </span>
                        </p>
                      ) : null}
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
              />
              <Bar
                stackId="split"
                dataKey="monthCosts"
                name={t("mortgageSim.monthCosts")}
                fill={COLORS.costs}
                radius={[4, 4, 0, 0]}
              />
              {rentEnabled ? (
                <Bar
                  dataKey="monthRentGross"
                  name={t("mortgageSim.monthRentGross")}
                  fill={COLORS.tenant}
                  radius={[4, 4, 0, 0]}
                />
              ) : null}
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
              data={chartPoints}
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
                      {rentEnabled ? (
                        <p className="text-neutral-600">
                          {t("mortgageSim.propertyValuePlusRent")}:{" "}
                          <span className="text-cyan-600">
                            {fmtMoney(row.propertyValuePlusRent, market)}
                          </span>
                        </p>
                      ) : null}
                      {rentEnabled && row.cumulativeRentIncome > 0 ? (
                        <p className="text-neutral-600">
                          {t("mortgageSim.cumulativeRentIncome")}:{" "}
                          <span className="text-cyan-600">
                            {fmtMoney(row.cumulativeRentIncome, market)}
                          </span>
                        </p>
                      ) : null}
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
                      <p className="text-neutral-600">
                        {t("mortgageSim.cumulativeCosts")}:{" "}
                        <span className="text-amber-600">
                          {fmtMoney(row.cumulativeCosts, market)}
                        </span>
                      </p>
                      {rentEnabled && row.cumulativeTenantCover > 0 ? (
                        <p className="text-neutral-600">
                          {t("mortgageSim.cumulativeTenantCover")}:{" "}
                          <span className="text-cyan-600">
                            {fmtMoney(row.cumulativeTenantCover, market)}
                          </span>
                        </p>
                      ) : null}
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
              />
              <Bar
                stackId="paid"
                dataKey="cumulativeCosts"
                name={t("mortgageSim.cumulativeCosts")}
                fill={COLORS.costs}
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
              {rentEnabled ? (
                <Line
                  type="monotone"
                  dataKey="propertyValuePlusRent"
                  name={t("mortgageSim.propertyValuePlusRent")}
                  stroke={COLORS.tenant}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {liveInEnabled ? (
        <div className="card p-5">
          <h3 className="mb-1 text-base font-semibold text-neutral-900">
            {t("mortgageSim.ownVsRentTitle")}
          </h3>
          <p className="mb-4 text-sm text-neutral-500">{t("mortgageSim.ownVsRentSubtitle")}</p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={chartPoints}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
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
                domain={["auto", "auto"]}
              />
              <ReferenceLine y={0} stroke={COLORS.grid} />
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
                        {t("mortgageSim.costOfOwning")}:{" "}
                        <span className="text-sky-600">{fmtMoney(row.totalPaid, market)}</span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.costOfRenting")}:{" "}
                        <span className="text-violet-600">
                          {fmtMoney(row.cumulativeRentAvoided, market)}
                        </span>
                      </p>
                      <p className="mt-1 font-medium text-neutral-800">
                        {t("mortgageSim.ownMinusRent")}:{" "}
                        <span
                          className={
                            row.ownMinusRent > 0 ? "text-red-500" : "text-green-600"
                          }
                        >
                          {fmtMoney(row.ownMinusRent, market)}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="totalPaid"
                name={t("mortgageSim.costOfOwning")}
                stroke={COLORS.equity}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="cumulativeRentAvoided"
                name={t("mortgageSim.costOfRenting")}
                stroke={COLORS.rentSaved}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="ownMinusRent"
                name={t("mortgageSim.ownMinusRent")}
                stroke={COLORS.interest}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {liveInEnabled ? (
        <div className="card p-5">
          <h3 className="mb-1 text-base font-semibold text-neutral-900">
            {t("mortgageSim.moneySavedTitle")}
          </h3>
          <p className="mb-4 text-sm text-neutral-500">
            {t("mortgageSim.moneySavedSubtitle", { pct: MORTGAGE_SIM_ETF_RETURN_PCT })}
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={chartPoints}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              barCategoryGap="22%"
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
                scale={scaleSymlog().constant(50_000) as never}
                domain={["auto", "auto"]}
              />
              <ReferenceLine y={0} stroke={COLORS.grid} />
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
                        {t("mortgageSim.moneySaved")}:{" "}
                        <span
                          className={
                            row.moneySaved <= 0 ? "text-green-600" : "text-red-500"
                          }
                        >
                          {fmtMoney(row.moneySaved, market)}
                        </span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.etfFromSaved", { pct: MORTGAGE_SIM_ETF_RETURN_PCT })}
                        :{" "}
                        <span className="text-violet-600">
                          {fmtMoney(row.etfFromSaved, market)}
                        </span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.propertyValue")}:{" "}
                        <span className="text-green-600">
                          {fmtMoney(row.propertyValue, market)}
                        </span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.propertyValuePlusMoneySaved")}:{" "}
                        <span className="text-cyan-600">
                          {fmtMoney(row.propertyValuePlusMoneySaved, market)}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
              <Bar
                dataKey="moneySaved"
                name={t("mortgageSim.moneySaved")}
                fill={COLORS.equity}
                fillOpacity={0.45}
                radius={[3, 3, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="etfFromSaved"
                name={t("mortgageSim.etfFromSaved", { pct: MORTGAGE_SIM_ETF_RETURN_PCT })}
                stroke={COLORS.rentSaved}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4 }}
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
              <Line
                type="monotone"
                dataKey="propertyValuePlusMoneySaved"
                name={t("mortgageSim.propertyValuePlusMoneySaved")}
                stroke={COLORS.tenant}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {liveInEnabled ? (
        <div className="card p-5">
          <h3 className="mb-1 text-base font-semibold text-neutral-900">
            {t("mortgageSim.totalCostsTitle")}
          </h3>
          <p className="mb-4 text-sm text-neutral-500">{t("mortgageSim.totalCostsSubtitle")}</p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={chartPoints}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
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
                        {t("mortgageSim.costOfOwning")}:{" "}
                        <span className="text-sky-600">{fmtMoney(row.totalPaid, market)}</span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.costOfRenting")}:{" "}
                        <span className="text-amber-600">
                          {fmtMoney(row.cumulativeRentAvoided, market)}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="totalPaid"
                name={t("mortgageSim.costOfOwning")}
                stroke={COLORS.equity}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="cumulativeRentAvoided"
                name={t("mortgageSim.costOfRenting")}
                stroke={COLORS.costs}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {liveInEnabled ? (
        <div className="card p-5">
          <h3 className="mb-1 text-base font-semibold text-neutral-900">
            {t("mortgageSim.yearlyCostTitle")}
          </h3>
          <p className="mb-4 text-sm text-neutral-500">{t("mortgageSim.yearlyCostSubtitle")}</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={yearlyCostPoints}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              barCategoryGap="18%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fill: COLORS.axis, fontSize: 11 }}
                axisLine={{ stroke: COLORS.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: COLORS.axis, fontSize: 11 }}
                tickFormatter={(v) => fmtMoney(v, market)}
                width={72}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <ReferenceLine y={0} stroke={COLORS.grid} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as (typeof yearlyCostPoints)[number];
                  return (
                    <div className="rounded-xl border border-surface-border bg-white px-3 py-2 text-xs shadow-lg">
                      <p className="mb-2 font-medium text-neutral-800">
                        {t("mortgageSim.yearTooltip", { year: Number(label) })}
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.yearOwnCost")}:{" "}
                        <span className="text-sky-600">{fmtMoney(row.yearOwnCost, market)}</span>
                      </p>
                      <p className="text-neutral-600">
                        {t("mortgageSim.yearRentCost")}:{" "}
                        <span className="text-violet-600">
                          {fmtMoney(row.yearRentCost, market)}
                        </span>
                      </p>
                      <p className="mt-1 font-medium text-neutral-800">
                        {t("mortgageSim.yearDiff")}:{" "}
                        <span
                          className={
                            row.yearDiff > 0 ? "text-red-500" : "text-green-600"
                          }
                        >
                          {fmtMoney(row.yearDiff, market)}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11 }} />
              <Bar
                dataKey="yearOwnCost"
                name={t("mortgageSim.yearOwnCost")}
                fill={COLORS.equity}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="yearRentCost"
                name={t("mortgageSim.yearRentCost")}
                fill={COLORS.rentSaved}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="yearDiff"
                name={t("mortgageSim.yearDiff")}
                fill={COLORS.interest}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
