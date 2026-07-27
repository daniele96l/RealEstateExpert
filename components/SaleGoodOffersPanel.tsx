"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SaleGoodOffersSection from "@/components/SaleGoodOffersSection";
import { fetchOccupancyMetrics } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import {
  OCCUPANCY_CITY_SLUGS,
  OCCUPANCY_CITY_STORAGE_KEY,
  getOccupancyCityConfig,
  isOccupancyCitySlug,
  type OccupancyCitySlug,
} from "@/lib/occupancy/cities";
import {
  resolveOccupancyMetricsPeriod,
  type OccupancyMetricsPeriod,
} from "@/lib/occupancy/metrics-period";
import { occupancyI18nRoot } from "@/lib/occupancy/operation";
import {
  defaultPortalForCity,
  portalsForCity,
  type OccupancyPortal,
} from "@/lib/occupancy/portals";
import type { OccupancyCityMetrics, TrackedRentalListing } from "@/lib/types";

const OCCUPANCY_PORTAL_STORAGE_KEY = "occupancy-portal";
const OCCUPANCY_METRICS_PERIOD_STORAGE_KEY = "occupancy-metrics-period";

const PORTAL_OPTIONS: Array<{
  id: OccupancyPortal;
  labelKey: "portalIdealista" | "portalImmobiliare" | "portalImmobiliareScraper" | "portalSreality";
}> = [
  { id: "immobiliare_scraper", labelKey: "portalImmobiliareScraper" },
  { id: "sreality", labelKey: "portalSreality" },
];

const PERIOD_OPTIONS: Array<{
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

function readStoredMetricsPeriod(): OccupancyMetricsPeriod {
  if (typeof window === "undefined") return "monthly";
  return resolveOccupancyMetricsPeriod(
    window.localStorage.getItem(OCCUPANCY_METRICS_PERIOD_STORAGE_KEY),
  );
}

export default function SaleGoodOffersPanel() {
  const { t } = useI18n();
  const ot = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      t(`${occupancyI18nRoot("sale")}.${key}`, vars),
    [t],
  );

  const [citySlug, setCitySlug] = useState<OccupancyCitySlug>(readStoredCity);
  const [portal, setPortal] = useState<OccupancyPortal>(() => readStoredPortal(readStoredCity()));
  const [metricsPeriod, setMetricsPeriod] =
    useState<OccupancyMetricsPeriod>(readStoredMetricsPeriod);
  const [metrics, setMetrics] = useState<OccupancyCityMetrics | null>(null);
  const [listings, setListings] = useState<TrackedRentalListing[]>([]);
  const [latestSnapshotAt, setLatestSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const market = getOccupancyCityConfig(citySlug).market;
  const perSqmLabel = t("listings.perSqm");
  const visiblePortals = useMemo(
    () => PORTAL_OPTIONS.filter(({ id }) => portalsForCity(citySlug).includes(id)),
    [citySlug],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOccupancyMetrics(
        null,
        portal,
        citySlug,
        metricsPeriod,
        null,
        "sale",
      );
      setMetrics(data.metrics);
      setListings(data.breakdown_listings ?? []);
      const latest =
        data.snapshot_diff?.current_fetched_at ??
        data.available_snapshots?.filter((s) => !s.excluded).at(-1)?.fetched_at ??
        data.metrics?.updated_at ??
        null;
      setLatestSnapshotAt(latest);
      if (data.selected_city) setCitySlug(data.selected_city as OccupancyCitySlug);
      if (data.selected_portal) setPortal(data.selected_portal);
    } catch (err) {
      setError(err instanceof Error ? err.message : ot("loadError"));
      setMetrics(null);
      setListings([]);
      setLatestSnapshotAt(null);
    } finally {
      setLoading(false);
    }
  }, [portal, citySlug, metricsPeriod, ot]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCityChange = (next: OccupancyCitySlug) => {
    if (next === citySlug) return;
    const nextPortal = readStoredPortal(next);
    window.localStorage.setItem(OCCUPANCY_CITY_STORAGE_KEY, next);
    window.localStorage.setItem(OCCUPANCY_PORTAL_STORAGE_KEY, nextPortal);
    setCitySlug(next);
    setPortal(nextPortal);
  };

  const handlePortalChange = (next: OccupancyPortal) => {
    if (next === portal) return;
    window.localStorage.setItem(OCCUPANCY_PORTAL_STORAGE_KEY, next);
    setPortal(next);
  };

  const handlePeriodChange = (next: OccupancyMetricsPeriod) => {
    if (next === metricsPeriod) return;
    window.localStorage.setItem(OCCUPANCY_METRICS_PERIOD_STORAGE_KEY, next);
    setMetricsPeriod(next);
  };

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="border-b border-surface-border/60 px-6 py-4">
          <h1 className="text-lg font-semibold text-neutral-900">{ot("goodOffers.title")}</h1>
          <p className="mt-1 text-sm text-neutral-600">{ot("goodOffers.subtitle")}</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="inline-flex flex-col gap-1 text-xs text-neutral-500" htmlFor="good-offers-city">
              {ot("citySelect")}
              <select
                id="good-offers-city"
                value={citySlug}
                onChange={(e) => handleCityChange(e.target.value as OccupancyCitySlug)}
                className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
              >
                {OCCUPANCY_CITY_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {t(`occupancy.cities.${slug}`)}
                  </option>
                ))}
              </select>
            </label>

            {visiblePortals.length > 1 ? (
              <label
                className="inline-flex flex-col gap-1 text-xs text-neutral-500"
                htmlFor="good-offers-portal"
              >
                {ot("dataSource")}
                <select
                  id="good-offers-portal"
                  value={portal}
                  onChange={(e) => handlePortalChange(e.target.value as OccupancyPortal)}
                  className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
                >
                  {visiblePortals.map(({ id, labelKey }) => (
                    <option key={id} value={id}>
                      {ot(labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label
              className="inline-flex flex-col gap-1 text-xs text-neutral-500"
              htmlFor="good-offers-period"
            >
              {ot("kpi.metricsPeriod")}
              <select
                id="good-offers-period"
                value={metricsPeriod}
                onChange={(e) =>
                  handlePeriodChange(e.target.value as OccupancyMetricsPeriod)
                }
                className="rounded-lg border border-surface-border/60 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-800"
              >
                {PERIOD_OPTIONS.map(({ id, labelKey }) => (
                  <option key={id} value={id}>
                    {ot(`kpi.${labelKey}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("common.loading")}</p>
        ) : error ? (
          <p className="px-6 py-8 text-center text-sm text-rose-600">{error}</p>
        ) : null}
      </div>

      {!loading && !error ? (
        <SaleGoodOffersSection
          listings={listings}
          metrics={metrics}
          metricsPeriod={metricsPeriod}
          latestSnapshotAt={latestSnapshotAt}
          market={market}
          t={ot}
          perSqmLabel={perSqmLabel}
          showIntro={false}
        />
      ) : null}
    </div>
  );
}
