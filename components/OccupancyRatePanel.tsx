"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchOccupancyMetrics, refreshOccupancySnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { OccupancyCityMetrics, OccupancyListingsPreview } from "@/lib/types";
import { fmtMoney } from "@/lib/utils";
import { Activity, MapPin, RefreshCw } from "lucide-react";

function formatWhen(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDays(value: number | null): string {
  if (value == null) return "—";
  return `${value}`;
}

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatTurnover(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(2);
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ label, value, hint }: KpiProps) {
  return (
    <div className="rounded-xl border border-surface-border/60 bg-surface-raised/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function OccupancyRatePanel() {
  const { t, locale } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "it-IT";
  const [metrics, setMetrics] = useState<OccupancyCityMetrics | null>(null);
  const [listingsPreview, setListingsPreview] = useState<OccupancyListingsPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshSummary, setLastRefreshSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOccupancyMetrics();
      setMetrics(data.metrics);
      setListingsPreview(data.listings_preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setLastRefreshSummary(null);
    try {
      const result = await refreshOccupancySnapshot();
      setMetrics(result.metrics);
      setListingsPreview(result.listings_preview);
      setLastRefreshSummary(
        t("occupancy.refreshSummary", {
          fetched: result.fetched_count,
          newCount: result.new_count,
          rented: result.rented_count,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.refreshError"));
    } finally {
      setRefreshing(false);
    }
  };

  const needsMoreSnapshots = (metrics?.snapshot_count ?? 0) < 2;

  return (
    <div className="space-y-6">
      <div className="card-glass p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="text-accent" size={22} />
              <h2 className="text-lg font-semibold text-white">{t("occupancy.title")}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">{t("occupancy.subtitle")}</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised/50 px-3 py-1.5 text-sm text-slate-300">
              <MapPin size={14} className="text-accent" />
              {t("occupancy.cityLocked")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity",
              refreshing && "opacity-60",
            )}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? t("occupancy.refreshing") : t("occupancy.refresh")}
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        {lastRefreshSummary ? (
          <p className="mt-4 text-sm text-emerald-400">{lastRefreshSummary}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>
            {t("occupancy.lastUpdate")}: {formatWhen(metrics?.updated_at ?? null, dateLocale)}
          </span>
          <span>
            {t("occupancy.snapshots")}: {metrics?.snapshot_count ?? 0}
          </span>
        </div>

        {needsMoreSnapshots ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {t("occupancy.needsSnapshots")}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-slate-500">{t("occupancy.disclaimer")}</p>
      </div>

      {listingsPreview ? (
        <div className="card-glass overflow-hidden">
          <div className="border-b border-surface-border/60 px-6 py-4">
            <h3 className="text-base font-semibold text-white">{t("occupancy.preview.title")}</h3>
            <p className="text-sm text-slate-400">{t("occupancy.preview.subtitle")}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>
                {t("occupancy.preview.cachedAt")}: {formatWhen(listingsPreview.fetched_at, dateLocale)}
              </span>
              {listingsPreview.provider ? (
                <span>{t("occupancy.preview.provider")}: {listingsPreview.provider}</span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 border-b border-surface-border/40 p-6 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("occupancy.preview.listings")}
              value={String(listingsPreview.listing_count)}
            />
            <KpiCard
              label={t("occupancy.preview.avgRent")}
              value={listingsPreview.avg_price != null ? fmtMoney(listingsPreview.avg_price) : "—"}
            />
            <KpiCard
              label={t("occupancy.preview.medianRent")}
              value={listingsPreview.median_price != null ? fmtMoney(listingsPreview.median_price) : "—"}
            />
            <KpiCard
              label={t("occupancy.preview.avgSqm")}
              value={listingsPreview.avg_sqm != null ? `${listingsPreview.avg_sqm} m²` : "—"}
            />
          </div>

          {listingsPreview.areas.length > 0 ? (
            <div className="border-b border-surface-border/40 px-6 py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("occupancy.preview.topAreas")}
              </p>
              <div className="flex flex-wrap gap-2">
                {listingsPreview.areas.map((area) => (
                  <span
                    key={area.zone}
                    className="rounded-lg border border-surface-border/60 bg-surface-raised/40 px-3 py-1.5 text-sm text-slate-300"
                  >
                    {area.zone}
                    <span className="ml-2 text-slate-500">
                      {area.count}
                      {area.avg_price != null ? ` · ${fmtMoney(area.avg_price)}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {listingsPreview.sample.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">{t("occupancy.preview.table.zone")}</th>
                    <th className="px-4 py-3">{t("occupancy.preview.table.rooms")}</th>
                    <th className="px-4 py-3">{t("occupancy.preview.table.sqm")}</th>
                    <th className="px-6 py-3">{t("occupancy.preview.table.rent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {listingsPreview.sample.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b border-surface-border/20 text-slate-300 last:border-0"
                    >
                      <td className="max-w-md px-6 py-3">
                        <p className="font-medium text-slate-200">{listing.zone ?? "—"}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{listing.address ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">{listing.rooms ?? "—"}</td>
                      <td className="px-4 py-3">{listing.sqm ?? "—"}</td>
                      <td className="px-6 py-3 font-medium text-accent">{fmtMoney(listing.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="card-glass px-6 py-12 text-center text-slate-400">{t("common.loading")}</div>
      ) : metrics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("occupancy.kpi.active")}
              value={String(metrics.active_count)}
            />
            <KpiCard
              label={t("occupancy.kpi.avgDom")}
              value={formatDays(metrics.avg_days_on_market)}
              hint={t("occupancy.kpi.domHint")}
            />
            <KpiCard
              label={t("occupancy.kpi.turnover")}
              value={formatTurnover(metrics.turnover_30d)}
              hint={t("occupancy.kpi.turnoverHint")}
            />
            <KpiCard
              label={t("occupancy.kpi.occupancy", { days: metrics.occupancy_window_days })}
              value={formatPct(metrics.estimated_occupancy_pct)}
              hint={t("occupancy.kpi.occupancyHint")}
            />
          </div>

          <div className="card-glass overflow-hidden">
            <div className="border-b border-surface-border/60 px-6 py-4">
              <h3 className="text-base font-semibold text-white">{t("occupancy.areasTitle")}</h3>
              <p className="text-sm text-slate-400">{t("occupancy.areasSubtitle")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">{t("occupancy.table.zone")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.active")}</th>
                    <th className="px-4 py-3">
                      {t("occupancy.table.rented", { days: metrics.occupancy_window_days })}
                    </th>
                    <th className="px-4 py-3">{t("occupancy.table.avgDom")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.medianDom")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.turnover")}</th>
                    <th className="px-6 py-3">{t("occupancy.table.occupancy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.areas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        {t("occupancy.noAreas")}
                      </td>
                    </tr>
                  ) : (
                    metrics.areas.map((area) => (
                      <tr
                        key={area.zone}
                        className="border-b border-surface-border/20 text-slate-300 last:border-0"
                      >
                        <td className="px-6 py-3 font-medium text-slate-200">{area.zone}</td>
                        <td className="px-4 py-3">{area.active_count}</td>
                        <td className="px-4 py-3">{area.rented_in_window}</td>
                        <td className="px-4 py-3">{formatDays(area.avg_days_on_market)}</td>
                        <td className="px-4 py-3">{formatDays(area.median_days_on_market)}</td>
                        <td className="px-4 py-3">{formatTurnover(area.turnover_30d)}</td>
                        <td className="px-6 py-3">{formatPct(area.estimated_occupancy_pct)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
