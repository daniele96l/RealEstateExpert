"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchOccupancyMetrics, refreshOccupancySnapshot } from "@/lib/api";
import { filterActiveBreakdownListings, type BreakdownGroupId } from "@/lib/occupancy/breakdown-listings";
import { resolveOccupancyListingUrl } from "@/lib/listing-url";
import {
  occupancySnapshotProgressPercent,
  type OccupancySnapshotProgressState,
} from "@/lib/occupancy-snapshot-progress";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type {
  OccupancyAreaMetrics,
  OccupancyCityMetrics,
  OccupancyDashboardData,
  OccupancyListingsPreview,
  OccupancyListingChangeStatus,
  OccupancyMapListing,
  OccupancySegmentGroupId,
  OccupancySegmentMetrics,
  OccupancySnapshotDiff,
  OccupancySnapshotListing,
  OccupancySnapshotSummary,
  TrackedRentalListing,
} from "@/lib/types";
import { fmtMoney } from "@/lib/utils";
import { Activity, CalendarDays, MapPin, RefreshCw, X } from "lucide-react";
import OccupancyAreaPriceChart from "@/components/OccupancyAreaPriceChart";
import OccupancySnapshotManagePanel from "@/components/OccupancySnapshotManagePanel";
import { importWithChunkRetry } from "@/lib/chunk-retry-import";

const OccupancyMinimap = dynamic(
  () =>
    importWithChunkRetry(
      () => import("./OccupancyMinimap"),
      "occupancy-minimap-chunk-retry",
    ),
  {
  ssr: false,
  loading: () => (
    <div className="flex h-52 items-center justify-center rounded-xl border border-surface-border/60 bg-neutral-50 text-sm text-neutral-500 sm:h-56">
      …
    </div>
  ),
},
);

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

function daysSincePublished(
  listing: TrackedRentalListing,
  asOfMs = Date.now(),
): number | null {
  if (!listing.listing_published_at) return null;
  const publishedMs = new Date(listing.listing_published_at).getTime();
  if (!Number.isFinite(publishedMs)) return null;
  return Math.max(0, Math.round((asOfMs - publishedMs) / (24 * 60 * 60 * 1000)));
}

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatTurnover(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}×`;
}

function metricsPeriodTableLabel(
  period: OccupancyMetricsPeriod,
  days: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (period) {
    case "daily":
      return t("occupancy.table.periodLabelDaily");
    case "weekly":
      return t("occupancy.table.periodLabelWeekly", { days });
    case "monthly":
      return t("occupancy.table.periodLabelMonthly", { days });
    case "longest":
      return t("occupancy.table.periodLabelLongest", { days });
  }
}

type MetricTone = "good" | "mid" | "bad" | "neutral";

function occupancyTone(value: number | null): MetricTone {
  if (value == null) return "neutral";
  if (value >= 75) return "good";
  if (value >= 55) return "mid";
  return "bad";
}

function turnoverTone(value: number | null): MetricTone {
  if (value == null) return "neutral";
  if (value >= 1.2) return "good";
  if (value >= 0.7) return "mid";
  return "bad";
}

function daysOnMarketTone(days: number | null): MetricTone {
  if (days == null) return "neutral";
  if (days <= 30) return "good";
  if (days <= 60) return "mid";
  return "bad";
}

const ROW_TONE_CLASS: Record<MetricTone, string> = {
  good: "bg-green-50/60",
  mid: "bg-amber-50/60",
  bad: "bg-rose-50/60",
  neutral: "",
};

const METRIC_TONE_CLASS: Record<MetricTone, string> = {
  good: "rounded-md bg-green-50 px-2 py-0.5 font-semibold text-green-700",
  mid: "rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800",
  bad: "rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-700",
  neutral: "text-neutral-500",
};

function MetricValue({
  value,
  tone,
}: {
  value: string;
  tone: MetricTone;
}) {
  return <span className={METRIC_TONE_CLASS[tone]}>{value}</span>;
}

import type { OccupancyPortal } from "@/lib/occupancy/portals";
import {
  OCCUPANCY_CITY_SLUGS,
  OCCUPANCY_CITY_STORAGE_KEY,
  getOccupancyCityConfig,
  isOccupancyCitySlug,
  type OccupancyCitySlug,
} from "@/lib/occupancy/cities";
import { defaultPortalForCity, portalsForCity, isOccupancyScraperPortal } from "@/lib/occupancy/portals";
import {
  occupancyMetricsPeriodDays,
  resolveOccupancyMetricsPeriod,
  type OccupancyMetricsPeriod,
} from "@/lib/occupancy/metrics-period";
import {
  OCCUPANCY_METRICS_BASIS_STORAGE_KEY,
  resolveOccupancyMetricsBasis,
  type OccupancyMetricsBasis,
} from "@/lib/occupancy/metrics-basis";

const OCCUPANCY_PORTAL_STORAGE_KEY = "occupancy-portal";
const OCCUPANCY_METRICS_PERIOD_STORAGE_KEY = "occupancy-metrics-period";

const METRICS_PERIOD_OPTIONS: Array<{
  id: OccupancyMetricsPeriod;
  labelKey:
    | "metricsPeriodDaily"
    | "metricsPeriodWeekly"
    | "metricsPeriodMonthly"
    | "metricsPeriodLongest";
}> = [
  { id: "daily", labelKey: "metricsPeriodDaily" },
  { id: "weekly", labelKey: "metricsPeriodWeekly" },
  { id: "monthly", labelKey: "metricsPeriodMonthly" },
  { id: "longest", labelKey: "metricsPeriodLongest" },
];

const OCCUPANCY_PORTAL_OPTIONS: Array<{
  id: OccupancyPortal;
  labelKey:
    | "portalIdealista"
    | "portalImmobiliare"
    | "portalImmobiliareScraper"
    | "portalIdealistaScraper"
    | "portalCasaScraper"
    | "portalSubitoScraper"
    | "portalSreality";
}> = [
  { id: "immobiliare_scraper", labelKey: "portalImmobiliareScraper" },
  { id: "idealista_scraper", labelKey: "portalIdealistaScraper" },
  { id: "casa_scraper", labelKey: "portalCasaScraper" },
  { id: "subito_scraper", labelKey: "portalSubitoScraper" },
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

const METRICS_BASIS_OPTIONS: Array<{
  id: OccupancyMetricsBasis;
  labelKey: "metricsBasisTracking" | "metricsBasisPosted";
}> = [
  { id: "tracking", labelKey: "metricsBasisTracking" },
  { id: "posted", labelKey: "metricsBasisPosted" },
];

function readStoredMetricsBasis(): OccupancyMetricsBasis {
  if (typeof window === "undefined") return resolveOccupancyMetricsBasis(null);
  return resolveOccupancyMetricsBasis(window.localStorage.getItem(OCCUPANCY_METRICS_BASIS_STORAGE_KEY));
}

function readStoredMetricsPeriod(): OccupancyMetricsPeriod {
  if (typeof window === "undefined") return resolveOccupancyMetricsPeriod(null);
  return resolveOccupancyMetricsPeriod(
    window.localStorage.getItem(OCCUPANCY_METRICS_PERIOD_STORAGE_KEY),
  );
}

function formatProviderLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  if (provider === "reggio_rentals") return "reggio-rentals (scraper)";
  if (provider === "idealista_scraper") return "Idealista (scraper)";
  if (provider === "casa_scraper") return "Casa.it (scraper)";
  if (provider === "subito_scraper") return "Subito.it (scraper)";
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
  valueTone?: MetricTone;
}

function KpiCard({ label, value, hint, valueTone }: KpiProps) {
  return (
    <div className="rounded-xl border border-surface-border/60 bg-neutral-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">
        {valueTone ? <MetricValue value={value} tone={valueTone} /> : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

type OccupancyKpiSlice = Pick<
  OccupancyCityMetrics,
  | "active_count"
  | "avg_days_on_market"
  | "rented_in_window"
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
    rented_in_window: metrics.rented_in_window,
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
    rented_in_window: area.rented_in_window,
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

interface BreakdownDrillDown {
  group: BreakdownGroupId;
  rowKey: string;
  rowLabel: string;
}

interface BreakdownRow {
  rowKey: string;
  rowLabel: string;
  areaFilterKey?: string;
  active_count: number;
  rented_in_window: number;
  avg_price: number | null;
  avg_price_per_sqm: number | null;
  avg_days_on_market: number | null;
  median_days_on_market: number | null;
  avg_waiting_days: number | null;
  turnover_30d: number | null;
  turnover_rented_30d: number;
  turnover_inventory_basis: number | null;
  estimated_occupancy_pct: number | null;
}

const BREAKDOWN_GROUPS: Array<{
  id: BreakdownGroupId;
  labelKey: "breakdownGroupZone" | "segmentsGroupPrice" | "segmentsGroupRooms" | "segmentsGroupSize";
}> = [
  { id: "zone", labelKey: "breakdownGroupZone" },
  { id: "price", labelKey: "segmentsGroupPrice" },
  { id: "rooms", labelKey: "segmentsGroupRooms" },
  { id: "size", labelKey: "segmentsGroupSize" },
];

function areaToBreakdownRow(area: OccupancyAreaMetrics): BreakdownRow {
  return {
    rowKey: area.zone,
    rowLabel: area.zone,
    areaFilterKey: area.zone,
    active_count: area.active_count,
    rented_in_window: area.rented_in_window,
    avg_price: area.avg_price,
    avg_price_per_sqm: area.avg_price_per_sqm,
    avg_days_on_market: area.avg_days_on_market,
    median_days_on_market: area.median_days_on_market,
    avg_waiting_days: area.avg_waiting_days,
    turnover_30d: area.turnover_30d,
    turnover_rented_30d: area.turnover_rented_30d,
    turnover_inventory_basis: area.turnover_inventory_basis,
    estimated_occupancy_pct: area.estimated_occupancy_pct,
  };
}

function segmentToBreakdownRow(
  segment: OccupancySegmentMetrics,
  group: OccupancySegmentGroupId,
  t: (key: string) => string,
): BreakdownRow {
  return {
    rowKey: segment.segment_id,
    rowLabel: segmentLabel(t, group, segment.segment_id),
    active_count: segment.active_count,
    rented_in_window: segment.rented_in_window,
    avg_price: segment.avg_price,
    avg_price_per_sqm: segment.avg_price_per_sqm,
    avg_days_on_market: segment.avg_days_on_market,
    median_days_on_market: segment.median_days_on_market,
    avg_waiting_days: segment.avg_waiting_days,
    turnover_30d: segment.turnover_30d,
    turnover_rented_30d: segment.turnover_rented_30d,
    turnover_inventory_basis: segment.turnover_inventory_basis,
    estimated_occupancy_pct: segment.estimated_occupancy_pct,
  };
}

function segmentLabel(
  t: (key: string) => string,
  group: OccupancySegmentGroupId,
  segmentId: string,
): string {
  return t(`occupancy.segments.${group}.${segmentId}`);
}

function BreakdownListingsModal({
  drillDown,
  listings,
  onClose,
  t,
  perSqmLabel,
  occupancyMarket,
  showDom,
  asOfMs,
}: {
  drillDown: BreakdownDrillDown;
  listings: TrackedRentalListing[];
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  perSqmLabel: string;
  occupancyMarket: import("@/lib/markets").MarketId;
  showDom: boolean;
  asOfMs: number;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sorted = useMemo(
    () => [...listings].sort((a, b) => b.price - a.price || (a.zone ?? "").localeCompare(b.zone ?? "", "it")),
    [listings],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("occupancy.breakdownDrilldown.title", {
        label: drillDown.rowLabel,
        count: sorted.length,
      })}
    >
      <div
        className="card flex max-h-[min(70vh,32rem)] w-full max-w-2xl flex-col overflow-hidden shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border px-3 py-2">
          <h3 className="truncate text-sm font-semibold text-neutral-900">
            {t("occupancy.breakdownDrilldown.title", {
              label: drillDown.rowLabel,
              count: sorted.length,
            })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
            aria-label={t("occupancy.breakdownDrilldown.close")}
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-neutral-500">
              {t("occupancy.breakdownDrilldown.empty")}
            </p>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-surface-border/40 text-left text-[10px] uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2">{t("occupancy.preview.table.zone")}</th>
                  <th className="px-2 py-2">{t("occupancy.preview.table.rooms")}</th>
                  <th className="px-2 py-2">{t("occupancy.preview.table.sqm")}</th>
                  <th className="px-2 py-2">{t("occupancy.preview.table.rent")}</th>
                  {showDom ? (
                    <th className="px-2 py-2">{t("occupancy.breakdownDrilldown.daysOnMarket")}</th>
                  ) : null}
                  <th className="px-2 py-2">{t("occupancy.breakdownDrilldown.daysSincePublished")}</th>
                  <th className="px-3 py-2">{t("occupancy.preview.table.rentPerSqm")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((listing) => {
                  const publishedDays = daysSincePublished(listing, asOfMs);
                  const rowTone = daysOnMarketTone(
                    publishedDays ?? (showDom ? listing.days_on_market : null),
                  );
                  const listingUrl = resolveOccupancyListingUrl(listing);
                  return (
                    <tr
                      key={listing.id}
                      className={cn(
                        "border-b border-surface-border/20 text-neutral-700 last:border-0",
                        ROW_TONE_CLASS[rowTone],
                      )}
                    >
                    <td className="max-w-[9rem] px-3 py-2">
                      {listingUrl ? (
                        <a
                          href={listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate font-medium text-sky-700 hover:text-sky-900 hover:underline"
                          title={listing.address ?? listing.zone ?? undefined}
                        >
                          {listing.zone ?? "—"}
                        </a>
                      ) : (
                        <p className="truncate font-medium text-neutral-800">{listing.zone ?? "—"}</p>
                      )}
                      {listing.address ? (
                        listingUrl ? (
                          <a
                            href={listingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-[10px] text-neutral-500 hover:text-sky-800 hover:underline"
                          >
                            {listing.address}
                          </a>
                        ) : (
                          <p className="truncate text-[10px] text-neutral-500">{listing.address}</p>
                        )
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{listing.rooms ?? "—"}</td>
                    <td className="px-2 py-2">{listing.sqm ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-neutral-900">
                      {fmtMoney(listing.price, occupancyMarket)}
                    </td>
                    {showDom ? (
                      <td className="px-2 py-2">
                        <MetricValue
                          value={formatDays(listing.days_on_market)}
                          tone={daysOnMarketTone(listing.days_on_market)}
                        />
                      </td>
                    ) : null}
                    <td className="px-2 py-2">
                      <MetricValue
                        value={formatDays(publishedDays)}
                        tone={daysOnMarketTone(publishedDays)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-700">
                      {formatPricePerSqm(listing.price, listing.sqm, perSqmLabel, occupancyMarket)}
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

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
  const [breakdownGroup, setBreakdownGroup] = useState<BreakdownGroupId>("zone");
  const [breakdownPage, setBreakdownPage] = useState(0);
  const [metricsAreaFilter, setMetricsAreaFilter] = useState<"all" | string>("all");
  const [metricsPeriod, setMetricsPeriod] = useState<OccupancyMetricsPeriod>(readStoredMetricsPeriod);
  const [metricsBasis, setMetricsBasis] = useState<OccupancyMetricsBasis>(readStoredMetricsBasis);
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
  const [lastRefreshWarning, setLastRefreshWarning] = useState<string | null>(null);
  const [breakdownListings, setBreakdownListings] = useState<TrackedRentalListing[]>([]);
  const [breakdownDrillDown, setBreakdownDrillDown] = useState<BreakdownDrillDown | null>(null);
  const [drillDownMounted, setDrillDownMounted] = useState(false);

  const applyDashboardData = useCallback((data: OccupancyDashboardData) => {
    setMetrics(data.metrics);
    setListingsPreview(data.listings_preview);
    setSnapshotDiff(data.snapshot_diff);
    setMapListings(data.map_listings);
    setBreakdownListings(data.breakdown_listings ?? []);
    setAvailableSnapshots(data.available_snapshots);
    setSelectedSnapshotAt(data.selected_snapshot_at);
    setPortal(data.selected_portal);
    setCitySlug(data.selected_city);
    setMetricsPeriod(data.selected_metrics_period);
    setMetricsBasis(data.selected_metrics_basis);
    setDiffFilter("all");
  }, []);

  const selectableSnapshots = useMemo(
    () => availableSnapshots.filter((snapshot) => !snapshot.excluded),
    [availableSnapshots],
  );

  const load = useCallback(async (asOf?: string | null, portalArg?: OccupancyPortal, cityArg?: OccupancyCitySlug, periodArg?: OccupancyMetricsPeriod, basisArg?: OccupancyMetricsBasis) => {
    const activePortal = portalArg ?? portal;
    const activeCity = cityArg ?? citySlug;
    const activePeriod = periodArg ?? metricsPeriod;
    const activeBasis = basisArg ?? metricsBasis;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOccupancyMetrics(asOf, activePortal, activeCity, activePeriod, activeBasis);
      applyDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.loadError"));
    } finally {
      setLoading(false);
    }
  }, [portal, citySlug, metricsPeriod, metricsBasis, t, applyDashboardData]);

  useEffect(() => {
    if (!selectedSnapshotAt) return;
    const snap = availableSnapshots.find((s) => s.fetched_at === selectedSnapshotAt);
    if (snap?.excluded) setSelectedSnapshotAt(null);
  }, [availableSnapshots, selectedSnapshotAt]);

  useEffect(() => {
    void load(selectedSnapshotAt, portal, citySlug, metricsPeriod, metricsBasis);
  }, [load, selectedSnapshotAt, portal, citySlug, metricsPeriod, metricsBasis]);

  useEffect(() => {
    setDiffPage(0);
  }, [diffFilter, selectedSnapshotAt, snapshotDiff?.current_fetched_at]);

  useEffect(() => {
    setBreakdownPage(0);
  }, [citySlug, portal, selectedSnapshotAt, metricsPeriod, metrics?.updated_at]);

  useEffect(() => {
    setMetricsAreaFilter("all");
  }, [citySlug, portal, selectedSnapshotAt, metrics?.updated_at]);

  useEffect(() => {
    setBreakdownPage(0);
  }, [breakdownGroup, citySlug, portal, selectedSnapshotAt, metrics?.updated_at]);

  useEffect(() => {
    setBreakdownDrillDown(null);
  }, [breakdownGroup, citySlug, portal, selectedSnapshotAt, metricsPeriod, metricsBasis]);

  useEffect(() => setDrillDownMounted(true), []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshProgress(null);
    setError(null);
    setLastRefreshSummary(null);
    setLastRefreshWarning(null);
    try {
      const result = await refreshOccupancySnapshot(portal, {
        city: citySlug,
        onProgress: (progress) => setRefreshProgress(progress),
      });
      setSelectedSnapshotAt(null);
      const latest = await fetchOccupancyMetrics(null, portal, citySlug, metricsPeriod, metricsBasis);
      setMetrics(latest.metrics);
      setListingsPreview(latest.listings_preview);
      setSnapshotDiff(latest.snapshot_diff);
      setMapListings(latest.map_listings);
      setBreakdownListings(latest.breakdown_listings ?? []);
      setAvailableSnapshots(latest.available_snapshots);
      setLastRefreshSummary(
        t("occupancy.refreshSummary", {
          fetched: result.fetched_count,
          newCount: result.new_count,
          rented: result.rented_count,
        }),
      );
      if (result.portal_dates_warning === "immobiliare_portal_dates_blocked") {
        setLastRefreshWarning(t("occupancy.portalDatesBlockedImmobiliare"));
      }
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

  const isPostedBasis = metricsBasis === "posted";
  const portalListingSample =
    snapshotDiff?.listings ?? listingsPreview?.sample ?? [];
  const portalDatesMissing =
    portal === "immobiliare_scraper" &&
    portalListingSample.length > 0 &&
    !portalListingSample.some(
      (listing) => listing.listing_published_at || listing.listing_updated_at,
    );
  const needsMoreSnapshots = !isPostedBasis && (metrics?.snapshot_count ?? 0) < 2;
  const viewingHistorical = selectedSnapshotAt != null;
  const previewFromSnapshot = listingsPreview?.source === "occupancy_snapshot";
  const portalNeedsFirstSnapshot =
    (isOccupancyScraperPortal(portal) || portal === "sreality") &&
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

  const handleMetricsBasisChange = (next: OccupancyMetricsBasis) => {
    if (next === metricsBasis) return;
    window.localStorage.setItem(OCCUPANCY_METRICS_BASIS_STORAGE_KEY, next);
    setMetricsBasis(next);
    setBreakdownPage(0);
  };

  const handleMetricsPeriodChange = (next: OccupancyMetricsPeriod) => {
    if (next === metricsPeriod) return;
    window.localStorage.setItem(OCCUPANCY_METRICS_PERIOD_STORAGE_KEY, next);
    setMetricsPeriod(next);
    setBreakdownPage(0);
  };

  const handlePortalChange = (next: OccupancyPortal) => {
    if (next === portal) return;
    window.localStorage.setItem(OCCUPANCY_PORTAL_STORAGE_KEY, next);
    setPortal(next);
    setSelectedSnapshotAt(null);
    setDiffPage(0);
    setLastRefreshSummary(null);
    setLastRefreshWarning(null);
    onDataMutated?.();
  };

  const statusLabel = (status: OccupancyListingChangeStatus) =>
    t(`occupancy.diff.${STATUS_STYLES[status].labelKey}`);

  const filteredDiffListings: OccupancySnapshotListing[] =
    snapshotDiff?.listings.filter((l) => diffFilter === "all" || l.change_status === diffFilter) ??
    [];

  const diffPageSize = 5;
  const diffPageCount = Math.ceil(filteredDiffListings.length / diffPageSize) || 1;
  const pagedDiffListings = filteredDiffListings.slice(
    diffPage * diffPageSize,
    diffPage * diffPageSize + diffPageSize,
  );

  const areas = metrics?.areas ?? [];
  const breakdownRows = useMemo((): BreakdownRow[] => {
    if (!metrics) return [];
    if (breakdownGroup === "zone") {
      return areas.map(areaToBreakdownRow);
    }
    return (metrics.segments?.[breakdownGroup] ?? []).map((segment) =>
      segmentToBreakdownRow(segment, breakdownGroup, t),
    );
  }, [areas, breakdownGroup, metrics, t]);

  const breakdownPageSize = 5;
  const breakdownPageCount = Math.ceil(breakdownRows.length / breakdownPageSize) || 1;
  const pagedBreakdownRows = breakdownRows.slice(
    breakdownPage * breakdownPageSize,
    breakdownPage * breakdownPageSize + breakdownPageSize,
  );

  const drillDownListings = useMemo(() => {
    if (!breakdownDrillDown) return [];
    return filterActiveBreakdownListings(
      breakdownListings,
      breakdownDrillDown.group,
      breakdownDrillDown.rowKey,
      citySlug,
      occupancyMarket,
    );
  }, [breakdownDrillDown, breakdownListings, citySlug, occupancyMarket]);

  useEffect(() => {
    setBreakdownPage((current) => Math.min(current, Math.max(0, breakdownPageCount - 1)));
  }, [breakdownPageCount]);

  const kpiMetrics = useMemo((): OccupancyKpiSlice | null => {
    if (!metrics) return null;
    if (metricsAreaFilter === "all") return kpiSliceFromCity(metrics);
    const area = areas.find((entry) => entry.zone === metricsAreaFilter);
    return area ? kpiSliceFromArea(area, metrics.occupancy_window_days) : kpiSliceFromCity(metrics);
  }, [areas, metrics, metricsAreaFilter]);

  const occupancyPeriodLabel = metrics
    ? metricsPeriodTableLabel(metricsPeriod, metrics.occupancy_window_days, t)
    : "";
  const turnoverPeriodLabel = metrics
    ? metricsPeriodTableLabel(metricsPeriod, metrics.turnover_window_days, t)
    : "";
  const periodTargetDays =
    metricsPeriod === "longest" ? null : occupancyMetricsPeriodDays(metricsPeriod);

  const diffFilters: Array<{ id: DiffFilter; label: string; count: number }> = snapshotDiff
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
        {lastRefreshWarning ? (
          <p className="mt-4 text-sm text-amber-700">{lastRefreshWarning}</p>
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

        {selectableSnapshots.length > 0 ? (
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
              {selectableSnapshots.map((snapshot) => (
                <option key={snapshot.fetched_at} value={snapshot.fetched_at}>
                  {formatSnapshotOption(snapshot, dateLocale)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {availableSnapshots.length > 0 ? (
          <OccupancySnapshotManagePanel
            snapshots={availableSnapshots}
            citySlug={citySlug}
            portal={portal}
            selectedSnapshotAt={selectedSnapshotAt}
            metricsPeriod={metricsPeriod}
            metricsBasis={metricsBasis}
            dateLocale={dateLocale}
            disabled={loading || refreshing}
            onDashboardUpdate={applyDashboardData}
          />
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
              : portal === "idealista_scraper"
                ? t("occupancy.portalIdealistaScraperHint")
                : portal === "casa_scraper"
                  ? t("occupancy.portalCasaScraperHint")
                  : portal === "subito_scraper"
                    ? t("occupancy.portalSubitoScraperHint")
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

        {portalDatesMissing ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {t("occupancy.portalDatesBlockedImmobiliare")}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-neutral-500">
          {isPostedBasis ? t("occupancy.disclaimerPosted") : t("occupancy.disclaimer")}
        </p>
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
            <p className="mt-1 text-xs text-neutral-500">{t("occupancy.diff.portalDatesHint")}</p>
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-neutral-600">{t("occupancy.kpi.metricsBasis")}</span>
                {METRICS_BASIS_OPTIONS.map(({ id, labelKey }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleMetricsBasisChange(id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      metricsBasis === id
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-surface-border/60 bg-neutral-50 text-neutral-600 hover:text-neutral-800",
                    )}
                  >
                    {t(`occupancy.kpi.${labelKey}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-neutral-600">{t("occupancy.kpi.metricsPeriod")}</span>
                {METRICS_PERIOD_OPTIONS.map(({ id, labelKey }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleMetricsPeriodChange(id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      metricsPeriod === id
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-surface-border/60 bg-neutral-50 text-neutral-600 hover:text-neutral-800",
                    )}
                  >
                    {t(`occupancy.kpi.${labelKey}`)}
                  </button>
                ))}
              </div>
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
          </div>

          {!metrics.flow_metrics_ready && !isPostedBasis ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {viewingHistorical
                ? t("occupancy.needsSnapshotsHistorical")
                : t("occupancy.needsSnapshots")}
            </div>
          ) : !isPostedBasis && metricsPeriod === "longest" ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              <p>
                {t("occupancy.kpi.longestPeriodBanner", {
                  from: metrics.tracking_started_at
                    ? formatWhen(metrics.tracking_started_at, dateLocale)
                    : "—",
                  to: metrics.tracking_ended_at
                    ? formatWhen(metrics.tracking_ended_at, dateLocale)
                    : "—",
                  days: metrics.tracking_days,
                  snapshotDays: metrics.tracking_snapshot_days,
                })}
              </p>
              <p className="mt-2 font-mono text-xs">
                {t("occupancy.kpi.longestPeriodMathOccupancy", {
                  rented: kpiMetrics.turnover_rented_30d,
                  inventory: kpiMetrics.turnover_inventory_basis ?? kpiMetrics.active_count,
                  pct: formatPct(kpiMetrics.estimated_occupancy_pct),
                })}
              </p>
              <p className="mt-1 font-mono text-xs">
                {t("occupancy.kpi.longestPeriodMathTurnover", {
                  rented: kpiMetrics.turnover_rented_30d,
                  inventory: kpiMetrics.turnover_inventory_basis ?? kpiMetrics.active_count,
                  turnover: formatTurnover(kpiMetrics.turnover_30d),
                })}
              </p>
            </div>
          ) : !isPostedBasis && periodTargetDays != null && metrics.tracking_days < periodTargetDays ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("occupancy.earlyTrackingBanner", {
                tracking: metrics.tracking_days,
                snapshotDays: metrics.tracking_snapshot_days,
                occupancy: metrics.occupancy_window_days,
                target: periodTargetDays,
              })}
            </div>
          ) : null}

          <div className={cn("grid gap-4", isPostedBasis ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4")}>
            <KpiCard
              label={t("occupancy.kpi.active")}
              value={String(kpiMetrics.active_count)}
            />
            <KpiCard
              label={t("occupancy.kpi.avgDom")}
              value={formatDays(kpiMetrics.avg_days_on_market)}
              hint={
                isPostedBasis
                  ? t("occupancy.kpi.postedDomHint")
                  : t("occupancy.kpi.domHint", { period: occupancyPeriodLabel })
              }
            />
            {isPostedBasis ? (
              <KpiCard
                label={t("occupancy.kpi.postedInWindow", { period: occupancyPeriodLabel })}
                value={String(kpiMetrics.rented_in_window)}
                hint={t("occupancy.kpi.postedInWindowHint", { period: occupancyPeriodLabel })}
              />
            ) : (
              <>
                <KpiCard
                  label={t("occupancy.kpi.turnover", { period: turnoverPeriodLabel })}
                  value={formatTurnover(kpiMetrics.turnover_30d)}
                  valueTone={turnoverTone(kpiMetrics.turnover_30d)}
                  hint={t("occupancy.kpi.turnoverHint", {
                    rented: kpiMetrics.turnover_rented_30d,
                    inventory: kpiMetrics.turnover_inventory_basis ?? kpiMetrics.active_count,
                    days: metrics.turnover_window_days,
                  })}
                />
                <KpiCard
                  label={t("occupancy.kpi.occupancy", { period: occupancyPeriodLabel })}
                  value={formatPct(kpiMetrics.estimated_occupancy_pct)}
                  valueTone={occupancyTone(kpiMetrics.estimated_occupancy_pct)}
                  hint={t("occupancy.kpi.occupancyHint", {
                    period: occupancyPeriodLabel,
                  })}
                />
              </>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-surface-border/60 px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">{t("occupancy.breakdownTitle")}</h3>
                  <p className="text-sm text-neutral-600">{t("occupancy.breakdownSubtitle")}</p>
                  {breakdownRows.length > 0 ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {t("occupancy.breakdownRowCount", { count: breakdownRows.length })}
                      {" · "}
                      {t("occupancy.metricLegend")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {BREAKDOWN_GROUPS.map(({ id, labelKey }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBreakdownGroup(id)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        breakdownGroup === id
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
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-6 py-3">
                      {breakdownGroup === "zone"
                        ? t("occupancy.table.zone")
                        : t("occupancy.table.segment")}
                    </th>
                    <th className="px-4 py-3">{t("occupancy.table.active")}</th>
                    <th className="px-4 py-3">
                      {isPostedBasis
                        ? t("occupancy.table.posted", { period: occupancyPeriodLabel })
                        : t("occupancy.table.rented", { period: occupancyPeriodLabel })}
                    </th>
                    <th className="px-4 py-3">{t("occupancy.table.avgRent")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.avgRentPerSqm")}</th>
                    <th className="px-4 py-3">{t("occupancy.table.medianDom")}</th>
                    {!isPostedBasis ? (
                      <>
                        <th
                          className="px-4 py-3 cursor-help"
                          title={t("occupancy.table.turnoverHint", {
                            days: metrics.turnover_window_days,
                            period: turnoverPeriodLabel,
                          })}
                        >
                          {t("occupancy.table.turnover", { period: turnoverPeriodLabel })}
                        </th>
                        <th
                          className="px-4 py-3 cursor-help"
                          title={t("occupancy.table.avgWaitingDaysHint", {
                            period: occupancyPeriodLabel,
                          })}
                        >
                          {t("occupancy.table.avgWaitingDays", { period: occupancyPeriodLabel })}
                        </th>
                        <th
                          className="px-6 py-3 cursor-help"
                          title={t("occupancy.table.occupancyHint", {
                            period: occupancyPeriodLabel,
                          })}
                        >
                          {t("occupancy.table.occupancy")} · {occupancyPeriodLabel}
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.length === 0 ? (
                    <tr>
                      <td colSpan={isPostedBasis ? 6 : 9} className="px-6 py-8 text-center text-neutral-500">
                        {breakdownGroup === "zone" ? t("occupancy.noAreas") : t("occupancy.noSegments")}
                      </td>
                    </tr>
                  ) : (
                    pagedBreakdownRows.map((row) => (
                      <tr
                        key={row.rowKey}
                        onClick={
                          row.areaFilterKey
                            ? () => setMetricsAreaFilter(row.areaFilterKey!)
                            : undefined
                        }
                        className={cn(
                          "border-b border-surface-border/20 text-neutral-700 last:border-0",
                          row.areaFilterKey && "cursor-pointer hover:bg-neutral-50/80",
                          row.areaFilterKey &&
                            metricsAreaFilter === row.areaFilterKey &&
                            "bg-sky-50",
                        )}
                      >
                        <td className="px-6 py-3 font-medium text-neutral-800">{row.rowLabel}</td>
                        <td
                          className="px-4 py-3 text-sky-700 underline decoration-dotted underline-offset-2 hover:text-sky-900 cursor-pointer"
                          title={t("occupancy.breakdownDrilldownHint")}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (row.active_count <= 0) return;
                            setBreakdownDrillDown({
                              group: breakdownGroup,
                              rowKey: row.rowKey,
                              rowLabel: row.rowLabel,
                            });
                          }}
                        >
                          {row.active_count}
                        </td>
                        <td className="px-4 py-3">{row.rented_in_window}</td>
                        <td className="px-4 py-3">
                          {row.avg_price != null ? fmtMoney(row.avg_price, occupancyMarket) : "—"}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {row.avg_price_per_sqm != null
                            ? `${fmtMoney(row.avg_price_per_sqm, occupancyMarket)}${perSqmLabel}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">{formatDays(row.median_days_on_market)}</td>
                        {!isPostedBasis ? (
                          <>
                            <td
                              className="px-4 py-3"
                              title={t("occupancy.table.turnoverHint", {
                                rented: row.turnover_rented_30d,
                                inventory: row.turnover_inventory_basis ?? row.active_count,
                                days: metrics.turnover_window_days,
                                period: turnoverPeriodLabel,
                              })}
                            >
                              <MetricValue
                                value={formatTurnover(row.turnover_30d)}
                                tone={turnoverTone(row.turnover_30d)}
                              />
                            </td>
                            <td
                              className="px-4 py-3"
                              title={t("occupancy.table.avgWaitingDaysHint", {
                                period: occupancyPeriodLabel,
                              })}
                            >
                              {formatDays(row.avg_waiting_days)}
                            </td>
                            <td
                              className="px-6 py-3"
                              title={t("occupancy.table.occupancyHint", {
                                period: occupancyPeriodLabel,
                              })}
                            >
                              <MetricValue
                                value={formatPct(row.estimated_occupancy_pct)}
                                tone={occupancyTone(row.estimated_occupancy_pct)}
                              />
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {breakdownRows.length > breakdownPageSize ? (
              <div className="flex items-center justify-between border-t border-surface-border/40 px-6 py-3 text-xs text-neutral-500">
                <button
                  type="button"
                  onClick={() => setBreakdownPage((p) => Math.max(0, p - 1))}
                  disabled={breakdownPage <= 0}
                  className={cn(
                    "rounded-lg border px-3 py-1.5",
                    breakdownPage <= 0
                      ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                      : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                  )}
                >
                  {t("occupancy.diff.paginationPrev")}
                </button>
                <span>
                  {t("occupancy.diff.paginationPage", {
                    current: breakdownPage + 1,
                    total: breakdownPageCount,
                  })}
                  {" · "}
                  {t("occupancy.removals.showing", {
                    from: breakdownPage * breakdownPageSize + 1,
                    to: Math.min((breakdownPage + 1) * breakdownPageSize, breakdownRows.length),
                    total: breakdownRows.length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setBreakdownPage((p) => Math.min(breakdownPageCount - 1, p + 1))}
                  disabled={breakdownPage >= breakdownPageCount - 1}
                  className={cn(
                    "rounded-lg border px-3 py-1.5",
                    breakdownPage >= breakdownPageCount - 1
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

      {drillDownMounted && breakdownDrillDown ? (
        <BreakdownListingsModal
          drillDown={breakdownDrillDown}
          listings={drillDownListings}
          onClose={() => setBreakdownDrillDown(null)}
          t={t}
          perSqmLabel={perSqmLabel}
          occupancyMarket={occupancyMarket}
          showDom={!isPostedBasis}
          asOfMs={
            metrics?.updated_at
              ? new Date(metrics.updated_at).getTime()
              : Date.now()
          }
        />
      ) : null}
    </div>
  );
}
