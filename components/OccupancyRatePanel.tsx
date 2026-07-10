"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchOccupancyMetrics, refreshOccupancySnapshot } from "@/lib/api";
import {
  occupancySnapshotProgressPercent,
  type OccupancySnapshotProgressState,
} from "@/lib/occupancy-snapshot-progress";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type {
  OccupancyAreaMetrics,
  OccupancyCityMetrics,
  OccupancyListingsPreview,
  OccupancyListingChangeStatus,
  OccupancyMapListing,
  OccupancySnapshotDiff,
  OccupancySnapshotListing,
  OccupancySnapshotSummary,
} from "@/lib/types";
import { fmtMoney } from "@/lib/utils";
import { Activity, CalendarDays, MapPin, RefreshCw } from "lucide-react";
import OccupancyAreaPriceChart from "@/components/OccupancyAreaPriceChart";

const OccupancyMinimap = dynamic(() => import("@/components/OccupancyMinimap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-52 items-center justify-center rounded-xl border border-surface-border/60 bg-neutral-50 text-sm text-neutral-500 sm:h-56">
      …
    </div>
  ),
});

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

function formatSnapshotOption(snapshot: OccupancySnapshotSummary, locale: string): string {
  const when = formatWhen(snapshot.fetched_at, locale);
  return `${when} · ${snapshot.active_count}`;
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
  return `${value.toFixed(2)}×`;
}

import type { OccupancyPortal } from "@/lib/occupancy/portals";
import {
  OCCUPANCY_CITY_SLUGS,
  OCCUPANCY_CITY_STORAGE_KEY,
  getOccupancyCityConfig,
  isOccupancyCitySlug,
  type OccupancyCitySlug,
} from "@/lib/occupancy/cities";
import { defaultPortalForCity, portalsForCity } from "@/lib/occupancy/portals";

const OCCUPANCY_PORTAL_STORAGE_KEY = "occupancy-portal";

const OCCUPANCY_PORTAL_OPTIONS: Array<{
  id: OccupancyPortal;
  labelKey: "portalIdealista" | "portalImmobiliare" | "portalImmobiliareScraper" | "portalSreality";
}> = [
  { id: "idealista", labelKey: "portalIdealista" },
  { id: "immobiliare", labelKey: "portalImmobiliare" },
  { id: "immobiliare_scraper", labelKey: "portalImmobiliareScraper" },
  { id: "sreality", labelKey: "portalSreality" },
];

function readStoredCity(): OccupancyCitySlug {
  if (typeof window === "undefined") return "reggio_calabria";
  const saved = window.localStorage.getItem(OCCUPANCY_CITY_STORAGE_KEY);
  return isOccupancyCitySlug(saved) ? saved : "reggio_calabria";
}

function readStoredPortal(citySlug: OccupancyCitySlug): OccupancyPortal {
  if (typeof window === "undefined") return defaultPortalForCity(citySlug);
  const saved = window.localStorage.getItem(OCCUPANCY_PORTAL_STORAGE_KEY);
  const allowed = portalsForCity(citySlug);
  if (saved && allowed.includes(saved as OccupancyPortal)) return saved as OccupancyPortal;
  return defaultPortalForCity(citySlug);
}

function formatProviderLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  if (provider === "reggio_rentals") return "reggio-rentals (scraper)";
  if (provider === "sreality") return "Sreality.cz";
  return provider;
}

function formatPricePerSqm(
  price: number,
  sqm: number | null | undefined,
  perSqmLabel: string,
  market: "it" | "cz",
): string {
  if (sqm == null || sqm <= 0) return "—";
  return `${fmtMoney(Math.round(price / sqm), market)}${perSqmLabel}`;
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ label, value, hint }: KpiProps) {
  return (
    <div className="rounded-xl border border-surface-border/60 bg-neutral-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

type OccupancyKpiSlice = Pick<
  OccupancyCityMetrics,
  | "active_count"
  | "avg_days_on_market"
  | "turnover_30d"
  | "turnover_rented_30d"
  | "turnover_inventory_basis"
  | "estimated_occupancy_pct"
  | "occupancy_window_days"
>;

function kpiSliceFromCity(metrics: OccupancyCityMetrics): OccupancyKpiSlice {
  return {
    active_count: metrics.active_count,
    avg_days_on_market: metrics.avg_days_on_market,
    turnover_30d: metrics.turnover_30d,
    turnover_rented_30d: metrics.turnover_rented_30d,
    turnover_inventory_basis: metrics.turnover_inventory_basis,
    estimated_occupancy_pct: metrics.estimated_occupancy_pct,
    occupancy_window_days: metrics.occupancy_window_days,
  };
}

function kpiSliceFromArea(area: OccupancyAreaMetrics, occupancyWindowDays: number): OccupancyKpiSlice {
  return {
    active_count: area.active_count,
    avg_days_on_market: area.avg_days_on_market,
    turnover_30d: area.turnover_30d,
    turnover_rented_30d: area.turnover_rented_30d,
    turnover_inventory_basis: area.turnover_inventory_basis,
    estimated_occupancy_pct: area.estimated_occupancy_pct,
    occupancy_window_days: occupancyWindowDays,
  };
}

const STATUS_STYLES: Record<
  OccupancyListingChangeStatus,
  { badge: string; row: string; labelKey: "stillActive" | "new" | "removed" }
> = {
  still_active: {
    badge: "border-green-200 bg-green-50 text-green-700",
    row: "bg-green-50",
    labelKey: "stillActive",
  },
  new: {
    badge: "border-sky-500/40 bg-sky-500/15 text-sky-300",
    row: "bg-sky-500/[0.04]",
    labelKey: "new",
  },
  removed: {
    badge: "border-rose-500/40 bg-rose-500/15 text-rose-300",
    row: "bg-rose-500/[0.04]",
    labelKey: "removed",
  },
};

type DiffFilter = "all" | OccupancyListingChangeStatus;

function ListingStatusBadge({
  status,
  label,
}: {
  status: OccupancyListingChangeStatus;
  label: string;
}) {
  const styles = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        styles.badge,
      )}
    >
      {label}
    </span>
  );
}

export default function OccupancyRatePanel({ onDataMutated }: { onDataMutated?: () => void } = {}) {
  const { t, locale } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "it-IT";
  const [metrics, setMetrics] = useState<OccupancyCityMetrics | null>(null);
  const [listingsPreview, setListingsPreview] = useState<OccupancyListingsPreview | null>(null);
  const [snapshotDiff, setSnapshotDiff] = useState<OccupancySnapshotDiff | null>(null);
  const [mapListings, setMapListings] = useState<OccupancyMapListing[]>([]);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");
  const [diffPage, setDiffPage] = useState(0);
  const [areasPage, setAreasPage] = useState(0);
  const [metricsAreaFilter, setMetricsAreaFilter] = useState<"all" | string>("all");
  const [citySlug, setCitySlug] = useState<OccupancyCitySlug>(readStoredCity);
  const cityConfig = getOccupancyCityConfig(citySlug);
  const occupancyMarket = cityConfig.market;
  const [portal, setPortal] = useState<OccupancyPortal>(() => readStoredPortal(readStoredCity()));
  const [availableSnapshots, setAvailableSnapshots] = useState<OccupancySnapshotSummary[]>([]);
  const [selectedSnapshotAt, setSelectedSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<OccupancySnapshotProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshSummary, setLastRefreshSummary] = useState<string | null>(null);

  const load = useCallback(async (asOf?: string | null, portalArg?: OccupancyPortal, cityArg?: OccupancyCitySlug) => {
    const activePortal = portalArg ?? portal;
    const activeCity = cityArg ?? citySlug;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOccupancyMetrics(asOf, activePortal, activeCity);
      setMetrics(data.metrics);
      setListingsPreview(data.listings_preview);
      setSnapshotDiff(data.snapshot_diff);
      setMapListings(data.map_listings);
      setAvailableSnapshots(data.available_snapshots);
      setSelectedSnapshotAt(data.selected_snapshot_at);
      setPortal(data.selected_portal);
      setCitySlug(data.selected_city);
      setDiffFilter("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.loadError"));
    } finally {
      setLoading(false);
    }
  }, [portal, citySlug, t]);

  useEffect(() => {
    void load(selectedSnapshotAt, portal, citySlug);
  }, [load, selectedSnapshotAt, portal, citySlug]);

  useEffect(() => {
    setDiffPage(0);
  }, [diffFilter, selectedSnapshotAt, snapshotDiff?.current_fetched_at]);

  useEffect(() => {
    setAreasPage(0);
  }, [citySlug, portal, selectedSnapshotAt, metrics?.updated_at]);

  useEffect(() => {
    setMetricsAreaFilter("all");
  }, [citySlug, portal, selectedSnapshotAt, metrics?.updated_at]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshProgress(null);
    setError(null);
    setLastRefreshSummary(null);
    try {
      const result = await refreshOccupancySnapshot(portal, {
        city: citySlug,
        onProgress: (progress) => setRefreshProgress(progress),
      });
      setMetrics(result.metrics);
      setListingsPreview(result.listings_preview);
      setSelectedSnapshotAt(null);
      const latest = await fetchOccupancyMetrics(null, portal, citySlug);
      setSnapshotDiff(latest.snapshot_diff);
      setMapListings(latest.map_listings);
      setAvailableSnapshots(latest.available_snapshots);
      setLastRefreshSummary(
        t("occupancy.refreshSummary", {
          fetched: result.fetched_count,
          newCount: result.new_count,
          rented: result.rented_count,
        }),
      );
      onDataMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.refreshError"));
    } finally {
      setRefreshing(false);
      setRefreshProgress(null);
    }
  };

  const perSqmLabel = t("listings.perSqm");
  const areaPriceAreas = listingsPreview?.areas ?? [];
  const showAreaPriceChart = areaPriceAreas.some(
    (area) =>
      (area.avg_price != null && area.avg_price > 0) ||
      (area.avg_price_per_sqm != null && area.avg_price_per_sqm > 0),
  );

  const needsMoreSnapshots = (metrics?.snapshot_count ?? 0) < 2;
  const viewingHistorical = selectedSnapshotAt != null;
  const previewFromSnapshot = listingsPreview?.source === "occupancy_snapshot";
  const portalNeedsFirstSnapshot =
    (portal === "immobiliare" || portal === "immobiliare_scraper" || portal === "sreality") &&
    (metrics?.snapshot_count ?? 0) === 0 &&
    !loading;

  const visiblePortalOptions = OCCUPANCY_PORTAL_OPTIONS.filter(({ id }) =>
    portalsForCity(citySlug).includes(id),
  );

  const handleCityChange = (next: OccupancyCitySlug) => {
    if (next === citySlug) return;
    window.localStorage.setItem(OCCUPANCY_CITY_STORAGE_KEY, next);
    const nextPortal = readStoredPortal(next);
    window.localStorage.setItem(OCCUPANCY_PORTAL_STORAGE_KEY, nextPortal);
    setCitySlug(next);
    setPortal(nextPortal);
    setSelectedSnapshotAt(null);
    setDiffPage(0);
  };

  const handlePortalChange = (next: OccupancyPortal) => {
    if (next === portal) return;
    window.localStorage.setItem(OCCUPANCY_PORTAL_STORAGE_KEY, next);
    setPortal(next);
    setSelectedSnapshotAt(null);
    setDiffPage(0);
    setLastRefreshSummary(null);
    onDataMutated?.();
  };

  const statusLabel = (status: OccupancyListingChangeStatus) =>
    t(`occupancy.diff.${STATUS_STYLES[status].labelKey}`);

  const filteredDiffListings: OccupancySnapshotListing[] =
    snapshotDiff?.listings.filter((l) => diffFilter === "all" || l.change_status === diffFilter) ??
    [];

  const diffPageSize = 10;
  const diffPageCount = Math.ceil(filteredDiffListings.length / diffPageSize) || 1;
  const pagedDiffListings = filteredDiffListings.slice(
    diffPage * diffPageSize,
    diffPage * diffPageSize + diffPageSize,
  );

  const areas = metrics?.areas ?? [];
  const kpiMetrics = useMemo((): OccupancyKpiSlice | null => {
    if (!metrics) return null;
    if (metricsAreaFilter === "all") return kpiSliceFromCity(metrics);
    const area = areas.find((entry) => entry.zone === metricsAreaFilter);
    return area ? kpiSliceFromArea(area, metrics.occupancy_window_days) : kpiSliceFromCity(metrics);
  }, [areas, metrics, metricsAreaFilter]);
  const areasPageSize = 10;
  const areasPageCount = Math.ceil(areas.length / areasPageSize) || 1;
  const pagedAreas = areas.slice(
    areasPage * areasPageSize,
    areasPage * areasPageSize + areasPageSize,
  );

  useEffect(() => {
    setAreasPage((current) => Math.min(current, Math.max(0, areasPageCount - 1)));
  }, [areasPageCount]);

  const diffFilters: Array<{ id: DiffFilter; label: string; count?: number }> = snapshotDiff
    ? [
        { id: "all", label: t("occupancy.diff.filterAll"), count: snapshotDiff.listings.length },
        {
          id: "still_active",
          label: t("occupancy.diff.stillActive"),
          count: snapshotDiff.still_active_count,
        },
        { id: "new", label: t("occupancy.diff.new"), count: snapshotDiff.new_count },
        {
          id: "removed",
          label: t("occupancy.diff.removed"),
          count: snapshotDiff.removed_count,
        },
      ]
    : [];

  const filteredMapListings = useMemo(() => {
    if (!snapshotDiff || diffFilter === "all") return mapListings;
    return mapListings.filter((listing) => listing.change_status === diffFilter);
  }, [diffFilter, mapListings, snapshotDiff]);

  const mapLegend = snapshotDiff
    ? [
        {
          status: "still_active" as const,
          label: t("occupancy.diff.stillActive"),
          count: snapshotDiff.still_active_count,
        },
        {
          status: "new" as const,
          label: t("occupancy.diff.new"),
          count: snapshotDiff.new_count,
        },
        {
          status: "removed" as const,
          label: t("occupancy.diff.removed"),
          count: snapshotDiff.removed_count,
        },
      ]
    : [];

  const mapOverlayOptions = useMemo(
    () => [
      {
        id: "zones" as const,
        label: t("occupancy.minimap.overlays.zones"),
        hint: t("occupancy.minimap.overlays.zonesHint"),
      },
      {
        id: "density" as const,
        label: t("occupancy.minimap.overlays.density"),
        hint: t("occupancy.minimap.overlays.densityHint"),
      },
      {
        id: "price" as const,
        label: t("occupancy.minimap.overlays.price"),
        hint: t("occupancy.minimap.overlays.priceHint"),
      },
    ],
    [t],
  );

  const minimapContent =
    mapListings.length > 0 ? (
      <>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
          {t("occupancy.minimap.title")}
        </p>
        <OccupancyMinimap
          listings={filteredMapListings}
          mapCenter={cityConfig.mapCenter}
          citySlug={citySlug}
          legend={mapLegend}
          emptyLabel={t("occupancy.minimap.empty")}
          expandable
          expandLabel={t("occupancy.minimap.expand")}
          expandedTitle={t("occupancy.minimap.expandedTitle")}
          closeLabel={t("occupancy.minimap.close")}
          layersTitle={t("occupancy.minimap.layersTitle")}
          zonesLegendTitle={t("occupancy.minimap.zonesLegendTitle")}
          listingsCountLabel={t("occupancy.minimap.listingsCount")}
          perSqmLabel={perSqmLabel}
          boundaryAttribution={t("occupancy.minimap.boundaryAttribution")}
          overlayOptions={mapOverlayOptions}
          statusLabels={{
            still_active: statusLabel("still_active"),
            new: statusLabel("new"),
            removed: statusLabel("removed"),
          }}
        />
      </>
    ) : null;

  const minimapBlock = minimapContent ? (
    <div className="border-b border-surface-border/40 px-6 py-4">{minimapContent}</div>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="text-neutral-900" size={22} />
              <h2 className="text-lg font-semibold text-neutral-900">{t("occupancy.title")}</h2>
            </div>
            <p className="mt-1 text-sm text-neutral-600">{t("occupancy.subtitle")}</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white/50 px-3 py-1.5 text-sm text-neutral-700">
              <MapPin size={14} className="text-neutral-900" />
              <label className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {t("occupancy.citySelect")}
                </span>
                <select
                  className="select-field !w-auto !border-0 !bg-transparent !py-0 !pl-0 text-sm font-medium text-neutral-800"
                  value={citySlug}
                  onChange={(e) => handleCityChange(e.target.value as OccupancyCitySlug)}
                  disabled={loading || refreshing}
                >
                  {OCCUPANCY_CITY_SLUGS.map((slug) => (
                    <option key={slug} value={slug}>
                      {t(`occupancy.cities.${slug}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                {t("occupancy.dataSource")}
              </p>
              <div className="flex flex-wrap gap-2">
                {visiblePortalOptions.map(({ id, labelKey }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handlePortalChange(id)}
                    disabled={loading || refreshing}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      portal === id
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-surface-border/60 bg-neutral-50 text-neutral-600 hover:text-neutral-800",
                    )}
                  >
                    {t(`occupancy.${labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex min-w-[240px] flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:bg-neutral-800",
                refreshing && "opacity-60",
              )}
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? t("occupancy.refreshing") : t("occupancy.refresh")}
            </button>

            {refreshing ? (
              <div className="space-y-2">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-border">
                  <div
                    className={cn(
                      "h-full rounded-full bg-accent transition-[width] duration-300",
                      !refreshProgress?.current && "w-1/4 animate-pulse",
                    )}
                    style={
                      refreshProgress && refreshProgress.total > 0 && refreshProgress.current > 0
                        ? {
                            width: `${occupancySnapshotProgressPercent(
                              refreshProgress.current,
                              refreshProgress.total,
                            )}%`,
                          }
                        : undefined
                    }
                  />
                </div>
                <p className="text-xs text-neutral-500">
                  {refreshProgress?.label || t("occupancy.refreshProgress")}
                  {refreshProgress && refreshProgress.listingsTotal > 0
                    ? ` · ${refreshProgress.listingsTotal} ${t("occupancy.refreshListings")}`
                    : ""}
                  {refreshProgress && refreshProgress.total > 0
                    ? ` · ${refreshProgress.current}/${refreshProgress.total}`
                    : ""}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        {lastRefreshSummary ? (
          <p className="mt-4 text-sm text-green-600">{lastRefreshSummary}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          <span>
            {t("occupancy.lastUpdate")}: {formatWhen(metrics?.updated_at ?? null, dateLocale)}
          </span>
          <span>
            {t("occupancy.snapshots")}: {metrics?.snapshot_count ?? 0}
          </span>
          {metrics?.last_provider ? (
            <span>
              {t("occupancy.lastProvider")}: {formatProviderLabel(metrics.last_provider)}
            </span>
          ) : null}
        </div>

        {availableSnapshots.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-neutral-600" htmlFor="occupancy-snapshot">
              <CalendarDays size={16} className="text-neutral-900" />
              {t("occupancy.selectSnapshot")}
            </label>
            <select
              id="occupancy-snapshot"
              value={selectedSnapshotAt ?? ""}
              onChange={(e) => setSelectedSnapshotAt(e.target.value || null)}
              disabled={loading || refreshing}
              className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-400/60"
            >
              <option value="">{t("occupancy.snapshotLatest")}</option>
              {availableSnapshots.map((snapshot) => (
                <option key={snapshot.fetched_at} value={snapshot.fetched_at}>
                  {formatSnapshotOption(snapshot, dateLocale)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {viewingHistorical ? (
          <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            {t("occupancy.snapshotHistorical")}
          </div>
        ) : null}

        {portalNeedsFirstSnapshot ? (
          <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            {portal === "immobiliare_scraper"
              ? t("occupancy.portalImmobiliareScraperHint")
              : portal === "sreality"
                ? t("occupancy.portalSrealityHint")
                : t("occupancy.portalImmobiliareHint")}
          </div>
        ) : null}

        {needsMoreSnapshots ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {t("occupancy.needsSnapshots")}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-neutral-500">{t("occupancy.disclaimer")}</p>
      </div>

      {listingsPreview ? (
        <div className="card overflow-hidden">
          <div className="border-b border-surface-border/60 px-6 py-4">
            <h3 className="text-base font-semibold text-neutral-900">
              {previewFromSnapshot ? t("occupancy.preview.snapshotTitle") : t("occupancy.preview.title")}
            </h3>
            <p className="text-sm text-neutral-600">
              {previewFromSnapshot ? t("occupancy.preview.snapshotSubtitle") : t("occupancy.preview.subtitle")}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
              <span>
                {t("occupancy.preview.cachedAt")}: {formatWhen(listingsPreview.fetched_at, dateLocale)}
              </span>
              {listingsPreview.provider ? (
                <span>
                  {t("occupancy.preview.provider")}: {formatProviderLabel(listingsPreview.provider)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 border-b border-surface-border/40 p-6 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label={t("occupancy.preview.listings")}
              value={String(listingsPreview.listing_count)}
            />
            <KpiCard
              label={t("occupancy.preview.avgRent")}
              value={listingsPreview.avg_price != null ? fmtMoney(listingsPreview.avg_price, occupancyMarket) : "—"}
            />
            <KpiCard
              label={t("occupancy.preview.medianRent")}
              value={listingsPreview.median_price != null ? fmtMoney(listingsPreview.median_price, occupancyMarket) : "—"}
            />
            <KpiCard
              label={t("occupancy.preview.avgRentPerSqm")}
              value={
                listingsPreview.avg_price_per_sqm != null
                  ? `${fmtMoney(listingsPreview.avg_price_per_sqm, occupancyMarket)}${perSqmLabel}`
                  : "—"
              }
            />
            <KpiCard
              label={t("occupancy.preview.avgSqm")}
              value={listingsPreview.avg_sqm != null ? `${listingsPreview.avg_sqm} m²` : "—"}
            />
          </div>

          {mapListings.length > 0 && !snapshotDiff ? minimapBlock : null}

          {listingsPreview.sample.length > 0 && !snapshotDiff ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-6 py-3">{t("occupancy.preview.table.zone")}</th>
                    <th className="px-4 py-3">{t("occupancy.preview.table.rooms")}</th>
                    <th className="px-4 py-3">{t("occupancy.preview.table.sqm")}</th>
                    <th className="px-4 py-3">{t("occupancy.preview.table.rent")}</th>
                    <th className="px-6 py-3">{t("occupancy.preview.table.rentPerSqm")}</th>
                  </tr>
                </thead>
                <tbody>
                  {listingsPreview.sample.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b border-surface-border/20 text-neutral-700 last:border-0"
                    >
                      <td className="max-w-md px-6 py-3">
                        <p className="font-medium text-neutral-800">{listing.zone ?? "—"}</p>
                        <p className="mt-0.5 truncate text-xs text-neutral-500">{listing.address ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">{listing.rooms ?? "—"}</td>
                      <td className="px-4 py-3">{listing.sqm ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-neutral-900">{fmtMoney(listing.price, occupancyMarket)}</td>
                      <td className="px-6 py-3 text-neutral-700">
                        {formatPricePerSqm(listing.price, listing.sqm, perSqmLabel, occupancyMarket)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {snapshotDiff ? (
        <div className="card overflow-hidden">
          <div className="border-b border-surface-border/60 px-6 py-4">
            <h3 className="text-base font-semibold text-neutral-900">{t("occupancy.diff.title")}</h3>
            <p className="text-sm text-neutral-600">{t("occupancy.diff.subtitle")}</p>
            <p className="mt-2 text-xs text-neutral-500">
              {t("occupancy.diff.comparedTo", {
                date: formatWhen(snapshotDiff.previous_fetched_at, dateLocale),
              })}
            </p>
          </div>

          <div className="grid border-b border-surface-border/40 lg:grid-cols-2 lg:items-center">
            <div className="grid gap-4 p-6 sm:grid-cols-3 lg:grid-cols-1 lg:border-r lg:border-surface-border/40">
              <KpiCard
                label={t("occupancy.diff.stillActive")}
                value={String(snapshotDiff.still_active_count)}
              />
              <KpiCard label={t("occupancy.diff.new")} value={String(snapshotDiff.new_count)} />
              <KpiCard
                label={t("occupancy.diff.removed")}
                value={String(snapshotDiff.removed_count)}
              />
            </div>

            {minimapContent ? <div className="p-6">{minimapContent}</div> : null}
          </div>

          <div className="flex flex-wrap gap-2 border-b border-surface-border/40 px-6 py-4">
            {diffFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setDiffFilter(filter.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  diffFilter === filter.id
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-surface-border/60 bg-neutral-50 text-neutral-600 hover:text-neutral-800",
                )}
              >
                {filter.label}
                {filter.count != null ? ` (${filter.count})` : ""}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-6 py-3">{t("occupancy.diff.table.status")}</th>
                  <th className="px-4 py-3">{t("occupancy.preview.table.zone")}</th>
                  <th className="px-4 py-3">{t("occupancy.preview.table.rooms")}</th>
                  <th className="px-4 py-3">{t("occupancy.preview.table.sqm")}</th>
                  <th className="px-4 py-3">{t("occupancy.preview.table.rent")}</th>
                  <th className="px-6 py-3">{t("occupancy.preview.table.rentPerSqm")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredDiffListings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">
                      {t("occupancy.diff.noListings")}
                    </td>
                  </tr>
                ) : (
                  pagedDiffListings.map((listing) => (
                    <tr
                      key={`${listing.id}-${listing.change_status}`}
                      className={cn(
                        "border-b border-surface-border/20 text-neutral-700 last:border-0",
                        STATUS_STYLES[listing.change_status].row,
                        listing.change_status === "removed" && "opacity-80",
                      )}
                    >
                      <td className="px-6 py-3">
                        <ListingStatusBadge
                          status={listing.change_status}
                          label={statusLabel(listing.change_status)}
                        />
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <p className="font-medium text-neutral-800">{listing.zone ?? "—"}</p>
                        <p className="mt-0.5 truncate text-xs text-neutral-500">{listing.address ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">{listing.rooms ?? "—"}</td>
                      <td className="px-4 py-3">{listing.sqm ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-neutral-900">{fmtMoney(listing.price, occupancyMarket)}</td>
                      <td className="px-6 py-3 text-neutral-700">
                        {formatPricePerSqm(listing.price, listing.sqm, perSqmLabel, occupancyMarket)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredDiffListings.length > diffPageSize ? (
            <div className="flex items-center justify-between px-6 py-3 text-xs text-neutral-500">
              <button
                type="button"
                onClick={() => setDiffPage((p) => Math.max(0, p - 1))}
                disabled={diffPage <= 0}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  diffPage <= 0
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-600"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {t("occupancy.diff.paginationPrev")}
              </button>
              <span>
                {t("occupancy.diff.paginationPage", {
                  current: diffPage + 1,
                  total: diffPageCount,
                })}
              </span>
              <button
                type="button"
                onClick={() => setDiffPage((p) => Math.min(diffPageCount - 1, p + 1))}
                disabled={diffPage >= diffPageCount - 1}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  diffPage >= diffPageCount - 1
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-600"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {t("occupancy.diff.paginationNext")}
              </button>
            </div>
          ) : null}
        </div>
      ) : availableSnapshots.length > 0 ? (
        <div className="rounded-xl border border-surface-border/60 bg-white px-6 py-4 text-sm text-neutral-600">
          {t("occupancy.diff.noPrevious")}
        </div>
      ) : null}

      {loading ? (
        <div className="card px-6 py-12 text-center text-neutral-600">{t("common.loading")}</div>
      ) : metrics && kpiMetrics ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-800">
              {metricsAreaFilter === "all"
                ? t("occupancy.kpi.allCity")
                : metricsAreaFilter}
            </p>
            {areas.length > 0 ? (
              <label className="inline-flex items-center gap-2 text-sm text-neutral-600" htmlFor="occupancy-metrics-area">
                <span>{t("occupancy.kpi.areaFilter")}</span>
                <select
                  id="occupancy-metrics-area"
                  value={metricsAreaFilter}
                  onChange={(e) => setMetricsAreaFilter(e.target.value)}
                  className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
                >
                  <option value="all">{t("occupancy.kpi.allCity")}</option>
                  {areas.map((area) => (
                    <option key={area.zone} value={area.zone}>
                      {area.zone}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("occupancy.kpi.active")}
              value={String(kpiMetrics.active_count)}
            />
            <KpiCard
              label={t("occupancy.kpi.avgDom")}
              value={formatDays(kpiMetrics.avg_days_on_market)}
              hint={t("occupancy.kpi.domHint")}
            />
            <KpiCard
              label={t("occupancy.kpi.turnover")}
              value={formatTurnover(kpiMetrics.turnover_30d)}
              hint={t("occupancy.kpi.turnoverHint", {
                rented: kpiMetrics.turnover_rented_30d,
                inventory: kpiMetrics.turnover_inventory_basis ?? kpiMetrics.active_count,
              })}
            />
            <KpiCard
              label={t("occupancy.kpi.occupancy", { days: kpiMetrics.occupancy_window_days })}
              value={formatPct(kpiMetrics.estimated_occupancy_pct)}
              hint={t("occupancy.kpi.occupancyHint")}
            />
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-surface-border/60 px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">{t("occupancy.areasTitle")}</h3>
                  <p className="text-sm text-neutral-600">{t("occupancy.areasSubtitle")}</p>
                </div>
                {areas.length > 0 ? (
                  <p className="text-xs text-neutral-500">
                    {t("occupancy.removals.total", { count: areas.length })}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-6 py-3">{t("occupancy.table.zone")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.active")}</th>
                    <th className="px-4 py-3">
                      {t("occupancy.table.rented", { days: metrics.occupancy_window_days })}
                    </th>
                    <th className="px-4 py-3">{t("occupancy.table.avgRent")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.avgRentPerSqm")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.avgDom")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.medianDom")}</th>
                    <th className="px-4 py-3" title={t("occupancy.kpi.turnoverHint", {
                      rented: metrics.turnover_rented_30d,
                      inventory: metrics.turnover_inventory_basis ?? metrics.active_count,
                    })}>
                      {t("occupancy.table.turnover")}
                    </th>
                    <th className="px-6 py-3">{t("occupancy.table.occupancy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-neutral-500">
                        {t("occupancy.noAreas")}
                      </td>
                    </tr>
                  ) : (
                    pagedAreas.map((area) => (
                      <tr
                        key={area.zone}
                        onClick={() => setMetricsAreaFilter(area.zone)}
                        className={cn(
                          "cursor-pointer border-b border-surface-border/20 text-neutral-700 last:border-0 hover:bg-neutral-50/80",
                          metricsAreaFilter === area.zone && "bg-sky-50",
                        )}
                      >
                        <td className="px-6 py-3 font-medium text-neutral-800">{area.zone}</td>
                        <td className="px-4 py-3">{area.active_count}</td>
                        <td className="px-4 py-3">{area.rented_in_window}</td>
                        <td className="px-4 py-3">
                          {area.avg_price != null ? fmtMoney(area.avg_price, occupancyMarket) : "—"}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {area.avg_price_per_sqm != null
                            ? `${fmtMoney(area.avg_price_per_sqm, occupancyMarket)}${perSqmLabel}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">{formatDays(area.avg_days_on_market)}</td>
                        <td className="px-4 py-3">{formatDays(area.median_days_on_market)}</td>
                        <td
                          className="px-4 py-3"
                          title={t("occupancy.kpi.turnoverHint", {
                            rented: area.turnover_rented_30d,
                            inventory: area.turnover_inventory_basis ?? area.active_count,
                          })}
                        >
                          {formatTurnover(area.turnover_30d)}
                        </td>
                        <td className="px-6 py-3">{formatPct(area.estimated_occupancy_pct)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {areas.length > areasPageSize ? (
              <div className="flex items-center justify-between border-t border-surface-border/40 px-6 py-3 text-xs text-neutral-500">
                <button
                  type="button"
                  onClick={() => setAreasPage((p) => Math.max(0, p - 1))}
                  disabled={areasPage <= 0}
                  className={cn(
                    "rounded-lg border px-3 py-1.5",
                    areasPage <= 0
                      ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                      : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                  )}
                >
                  {t("occupancy.diff.paginationPrev")}
                </button>
                <span>
                  {t("occupancy.diff.paginationPage", {
                    current: areasPage + 1,
                    total: areasPageCount,
                  })}
                  {" · "}
                  {t("occupancy.removals.showing", {
                    from: areasPage * areasPageSize + 1,
                    to: Math.min((areasPage + 1) * areasPageSize, areas.length),
                    total: areas.length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setAreasPage((p) => Math.min(areasPageCount - 1, p + 1))}
                  disabled={areasPage >= areasPageCount - 1}
                  className={cn(
                    "rounded-lg border px-3 py-1.5",
                    areasPage >= areasPageCount - 1
                      ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                      : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                  )}
                >
                  {t("occupancy.diff.paginationNext")}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {!loading && showAreaPriceChart ? (
        <div className="card overflow-hidden">
          <OccupancyAreaPriceChart
            areas={areaPriceAreas}
            perSqmLabel={perSqmLabel}
            market={occupancyMarket}
            cityAvgRent={listingsPreview?.avg_price}
            cityAvgPerSqm={listingsPreview?.avg_price_per_sqm}
          />
        </div>
      ) : null}
    </div>
  );
}
