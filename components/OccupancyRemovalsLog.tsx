"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchOccupancyRemovals } from "@/lib/api";
import {
  OCCUPANCY_CITY_STORAGE_KEY,
  isOccupancyCitySlug,
  type OccupancyCitySlug,
} from "@/lib/occupancy/cities";
import { defaultPortalForCity, portalsForCity, type OccupancyPortal } from "@/lib/occupancy/portals";
import { getOccupancyCityConfig } from "@/lib/occupancy/cities";
import type { MarketId } from "@/lib/markets";
import type { OccupancyRemovalEvent } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { cn, fmtMoney } from "@/lib/utils";
import { ClipboardList } from "lucide-react";

const OCCUPANCY_PORTAL_STORAGE_KEY = "occupancy-portal";
const REMOVALS_FETCH_LIMIT = 500;
const PAGE_SIZE = 5;

function readStoredPortal(citySlug: OccupancyCitySlug): OccupancyPortal {
  if (typeof window === "undefined") return defaultPortalForCity(citySlug);
  const saved = window.localStorage.getItem(OCCUPANCY_PORTAL_STORAGE_KEY);
  const allowed = portalsForCity(citySlug);
  if (saved && allowed.includes(saved as OccupancyPortal)) return saved as OccupancyPortal;
  return defaultPortalForCity(citySlug);
}

function readStoredCity(): OccupancyCitySlug {
  if (typeof window === "undefined") return "reggio_calabria";
  const saved = window.localStorage.getItem(OCCUPANCY_CITY_STORAGE_KEY);
  return isOccupancyCitySlug(saved) ? saved : "reggio_calabria";
}

function formatWhen(iso: string, locale: string): string {
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

function formatPricePerSqm(
  price: number,
  sqm: number | null,
  perSqmLabel: string,
  market: MarketId,
): string {
  if (sqm == null || sqm <= 0) return "—";
  return `${fmtMoney(Math.round(price / sqm), market)}${perSqmLabel}`;
}

function formatPriceHistory(
  history: OccupancyRemovalEvent["price_history"],
  market: MarketId,
): string {
  if (history.length <= 1) return "—";
  return history.map((p) => fmtMoney(p.price, market)).join(" → ");
}

interface Props {
  refreshToken?: number;
}

export default function OccupancyRemovalsLog({ refreshToken = 0 }: Props) {
  const { t, locale } = useI18n();
  const [events, setEvents] = useState<OccupancyRemovalEvent[]>([]);
  const [displayMarket, setDisplayMarket] = useState<MarketId>("it");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateLocale = locale === "en" ? "en-GB" : "it-IT";
  const perSqmLabel = t("listings.perSqm");

  const pageCount = Math.ceil(events.length / PAGE_SIZE) || 1;
  const pageEvents = useMemo(
    () => events.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [events, page],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const citySlug = readStoredCity();
      const portal = readStoredPortal(citySlug);
      const market = getOccupancyCityConfig(citySlug).market;
      const data = await fetchOccupancyRemovals(portal, REMOVALS_FETCH_LIMIT, citySlug);
      setEvents(data.events);
      setDisplayMarket(market);
      setPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("occupancy.removals.loadError"));
      setEvents([]);
      setPage(0);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-surface-border/60 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
              <ClipboardList size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900">{t("occupancy.removals.title")}</h2>
              <p className="mt-1 text-sm text-neutral-600">{t("occupancy.removals.subtitle")}</p>
            </div>
          </div>
          {!loading && !error && events.length > 0 ? (
            <p className="text-xs text-neutral-500">
              {t("occupancy.removals.total", { count: events.length })}
            </p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("common.loading")}</p>
      ) : error ? (
        <p className="px-6 py-8 text-center text-sm text-rose-400">{error}</p>
      ) : events.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-neutral-500">{t("occupancy.removals.empty")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border/40 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-6 py-3">{t("occupancy.removals.table.detected")}</th>
                  <th className="px-4 py-3">{t("occupancy.removals.table.zone")}</th>
                  <th className="px-4 py-3">{t("occupancy.removals.table.rent")}</th>
                  <th className="px-4 py-3">{t("occupancy.removals.table.rentPerSqm")}</th>
                  <th className="px-4 py-3">{t("occupancy.removals.table.dom")}</th>
                  <th className="px-4 py-3">{t("occupancy.removals.table.priceHistory")}</th>
                  <th className="px-6 py-3">{t("occupancy.removals.table.address")}</th>
                </tr>
              </thead>
              <tbody>
                {pageEvents.map((event) => (
                  <tr
                    key={`${event.id}-${event.detected_at}`}
                    className="border-b border-surface-border/20 text-neutral-700 last:border-0"
                  >
                    <td className="whitespace-nowrap px-6 py-3 text-xs text-neutral-600">
                      {formatWhen(event.detected_at, dateLocale)}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800">{event.zone ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {fmtMoney(event.price, displayMarket)}
                    </td>
                    <td className="px-4 py-3">
                      {formatPricePerSqm(event.price, event.sqm, perSqmLabel, displayMarket)}
                    </td>
                    <td className="px-4 py-3">
                      {event.days_on_market != null ? `${event.days_on_market}d` : "—"}
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3 text-xs text-neutral-500">
                      {formatPriceHistory(event.price_history, displayMarket)}
                    </td>
                    <td className="max-w-md px-6 py-3">
                      <p className="truncate text-neutral-700">{event.address ?? "—"}</p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{event.id}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {events.length > PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-surface-border/40 px-6 py-3 text-xs text-neutral-500">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page <= 0}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  page <= 0
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {t("occupancy.diff.paginationPrev")}
              </button>
              <span>
                {t("occupancy.diff.paginationPage", {
                  current: page + 1,
                  total: pageCount,
                })}
                {" · "}
                {t("occupancy.removals.showing", {
                  from: page * PAGE_SIZE + 1,
                  to: Math.min((page + 1) * PAGE_SIZE, events.length),
                  total: events.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  page >= pageCount - 1
                    ? "border-surface-border/60 bg-neutral-50 text-neutral-400"
                    : "border-surface-border/60 bg-neutral-50 hover:text-neutral-800",
                )}
              >
                {t("occupancy.diff.paginationNext")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
